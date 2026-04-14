import { db, ensureTables, getLastSchemaError } from "@autosales/db";
import { sql } from "drizzle-orm";
import Link from "next/link";
import { COMPANY_STATUSES, STATUS_LABELS, STATUS_COLORS, getMonthName, type CompanyStatus } from "@autosales/core";

export const dynamic = "force-dynamic";

interface GroupRow {
  id: string;
  company_name: string | null;
  domain: string;
  status: string;
  renewal_month: number | null;
  last_activity_at: string | null;
  next_action_at: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  email_count: string;
}

const SORTABLE_COLUMNS: Record<string, string> = {
  name: "COALESCE(c.company_name, c.domain)",
  domain: "c.domain",
  primary_contact: "c.company_name",
  status: "c.status",
  last_activity: "c.last_activity_at",
  next_action: "c.next_action_at",
  renewal: "c.renewal_month",
};

// Normalize `db.execute()` results — drizzle/postgres-js may return a bare
// array or an object with a `rows` property depending on driver version.
function toRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown[] }).rows)) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

interface GroupsPageProps {
  searchParams: { search?: string; status?: string; sort?: string; dir?: string; page?: string };
}

// Outer wrapper: catches ANY server-side error (including render-phase errors)
// and renders a full diagnostic dump so we can see what's actually failing in
// production. Without this wrapper, Next.js masks the real error text and only
// shows a digest in the error boundary.
export default async function GroupsPage(props: GroupsPageProps) {
  try {
    return await renderGroupsPage(props);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error && err.stack ? err.stack : "";
    console.error("Groups page fatal error:", err);
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4 text-red-900">Groups — render failed</h1>
        <div className="p-4 bg-red-50 border border-red-200 rounded">
          <p className="text-sm font-medium text-red-900 mb-2">Fatal error (caught by outer guard):</p>
          <pre className="text-xs font-mono whitespace-pre-wrap break-all text-red-800">
{message}
{stack ? "\n\n" + stack : ""}
          </pre>
        </div>
      </div>
    );
  }
}

async function renderGroupsPage({
  searchParams,
}: GroupsPageProps) {
  const page = Number(searchParams.page) || 1;
  const limit = 50;
  const offset = (page - 1) * limit;

  const sortCol = SORTABLE_COLUMNS[searchParams.sort || "name"] || SORTABLE_COLUMNS.name;
  const sortDir = searchParams.dir === "desc" ? "DESC" : "ASC";

  let groups: GroupRow[] = [];
  let total = 0;
  let stats = { lead: 0, current_client: 0, old_client: 0, not_qualified: 0 };
  let errorMessage: string | null = null;

  try {
    // Ensure schema is migrated before querying
    await ensureTables();

    const conditions: string[] = [];

    if (searchParams.status && COMPANY_STATUSES.includes(searchParams.status as CompanyStatus)) {
      conditions.push(`c.status = '${searchParams.status}'`);
    }

    if (searchParams.search) {
      const safe = searchParams.search.replace(/'/g, "''");
      conditions.push(`(
        c.company_name ILIKE '%${safe}%'
        OR c.domain ILIKE '%${safe}%'
      )`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Query 1: count
    const countRaw = await db.execute(sql.raw(
      `SELECT count(*)::int AS count FROM companies c ${whereClause}`
    ));
    total = Number(toRows<{ count: number | string }>(countRaw)[0]?.count ?? 0);

    // Query 2: companies page (no LATERAL, no subqueries)
    const companyRaw = await db.execute(sql.raw(
      `SELECT c.id, c.company_name, c.domain, c.status, c.renewal_month,
              c.last_activity_at, c.next_action_at
       FROM companies c
       ${whereClause}
       ORDER BY ${sortCol} ${sortDir} NULLS LAST
       LIMIT ${limit} OFFSET ${offset}`
    ));
    type CompanyRow = {
      id: string;
      company_name: string | null;
      domain: string;
      status: string;
      renewal_month: number | null;
      last_activity_at: string | null;
      next_action_at: string | null;
    };
    const companyRows = toRows<CompanyRow>(companyRaw);

    // Query 3: first contact per company (for display)
    const contactMap = new Map<string, { name: string; email: string }>();
    if (companyRows.length > 0) {
      const idList = companyRows.map((c) => `'${c.id}'`).join(",");
      const contactRaw = await db.execute(sql.raw(
        `SELECT DISTINCT ON (company_id) company_id, name, email
         FROM contacts
         WHERE company_id IN (${idList})
         ORDER BY company_id, created_at ASC`
      ));
      for (const r of toRows<{ company_id: string; name: string; email: string }>(contactRaw)) {
        contactMap.set(r.company_id, { name: r.name, email: r.email });
      }
    }

    // Query 4: email counts per company
    const emailMap = new Map<string, number>();
    if (companyRows.length > 0) {
      const idList = companyRows.map((c) => `'${c.id}'`).join(",");
      const emailRaw = await db.execute(sql.raw(
        `SELECT company_id, count(*)::int AS c
         FROM email_messages
         WHERE company_id IN (${idList})
         GROUP BY company_id`
      ));
      for (const r of toRows<{ company_id: string; c: number | string }>(emailRaw)) {
        emailMap.set(r.company_id, Number(r.c));
      }
    }

    // Stitch rows together. Force strings/numbers at the boundary so
    // nothing BigInt-ish leaks into React render.
    groups = companyRows.map<GroupRow>((c) => ({
      id: c.id,
      company_name: c.company_name,
      domain: c.domain,
      status: c.status,
      renewal_month: c.renewal_month === null ? null : Number(c.renewal_month),
      last_activity_at: c.last_activity_at,
      next_action_at: c.next_action_at,
      primary_contact_name: contactMap.get(c.id)?.name ?? null,
      primary_contact_email: contactMap.get(c.id)?.email ?? null,
      email_count: String(emailMap.get(c.id) ?? 0),
    }));

    // Query 5: per-status stats
    const statsRaw = await db.execute(sql.raw(
      `SELECT status, count(*)::int AS count FROM companies GROUP BY status`
    ));
    for (const row of toRows<{ status: string; count: number | string }>(statsRaw)) {
      if (row.status in stats) (stats as Record<string, number>)[row.status] = Number(row.count);
    }
  } catch (err) {
    errorMessage = err instanceof Error ? (err.stack ?? err.message) : String(err);
    console.error("Groups page error:", err);
  }

  // Surface any migration errors recorded by ensureTables(), even if the
  // queries above appeared to succeed against a partially-migrated schema.
  const schemaErr = getLastSchemaError();
  if (schemaErr) {
    errorMessage = errorMessage ? `${errorMessage}\n---\nSchema: ${schemaErr}` : `Schema: ${schemaErr}`;
  }

  const buildSortLink = (col: string) => {
    const params = new URLSearchParams();
    if (searchParams.search) params.set("search", searchParams.search);
    if (searchParams.status) params.set("status", searchParams.status);
    params.set("sort", col);
    params.set("dir", searchParams.sort === col && searchParams.dir !== "desc" ? "desc" : "asc");
    return `/groups?${params.toString()}`;
  };

  const buildFilterLink = (status?: string) => {
    const params = new URLSearchParams();
    if (searchParams.search) params.set("search", searchParams.search);
    if (status) params.set("status", status);
    return `/groups?${params.toString()}`;
  };

  const sortIcon = (col: string) => {
    if (searchParams.sort !== col) return "";
    return searchParams.dir === "desc" ? " ↓" : " ↑";
  };

  const buildPageHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (searchParams.search) params.set("search", searchParams.search);
    if (searchParams.status) params.set("status", searchParams.status);
    if (searchParams.sort) params.set("sort", searchParams.sort);
    if (searchParams.dir) params.set("dir", searchParams.dir);
    params.set("page", String(targetPage));
    return `/groups?${params.toString()}`;
  };

  return (
    <div>
      {errorMessage && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded">
          <p className="text-sm font-medium text-red-900">Error loading groups:</p>
          <p className="text-xs text-red-700 mt-1 font-mono break-all">{errorMessage}</p>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Groups ({total})</h1>
        <div className="flex gap-2">
          <form className="flex gap-2">
            {searchParams.status && <input type="hidden" name="status" value={searchParams.status} />}
            <input
              name="search"
              type="text"
              placeholder="Search name, domain, contact..."
              defaultValue={searchParams.search || ""}
              className="px-3 py-1.5 border rounded text-sm bg-background w-64"
            />
            <button type="submit" className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm">Search</button>
          </form>
          <Link href="/import" className="px-3 py-1.5 border rounded text-sm hover:bg-muted">+ Import CSV</Link>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 mb-4">
        <Link
          href={buildFilterLink()}
          className={`text-xs px-3 py-1 rounded-full ${!searchParams.status ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}
        >
          All ({total})
        </Link>
        {COMPANY_STATUSES.map((s) => (
          <Link
            key={s}
            href={buildFilterLink(s)}
            className={`text-xs px-3 py-1 rounded-full ${searchParams.status === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}
          >
            {STATUS_LABELS[s]} ({(stats as Record<string, number>)[s] ?? 0})
          </Link>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left p-3 font-medium"><Link href={buildSortLink("name")} className="hover:underline">Name{sortIcon("name")}</Link></th>
              <th className="text-left p-3 font-medium"><Link href={buildSortLink("domain")} className="hover:underline">Domain{sortIcon("domain")}</Link></th>
              <th className="text-left p-3 font-medium"><Link href={buildSortLink("primary_contact")} className="hover:underline">Primary Contact{sortIcon("primary_contact")}</Link></th>
              <th className="text-left p-3 font-medium"><Link href={buildSortLink("status")} className="hover:underline">Status{sortIcon("status")}</Link></th>
              <th className="text-left p-3 font-medium"><Link href={buildSortLink("last_activity")} className="hover:underline">Last Activity{sortIcon("last_activity")}</Link></th>
              <th className="text-left p-3 font-medium"><Link href={buildSortLink("next_action")} className="hover:underline">Next Action{sortIcon("next_action")}</Link></th>
              <th className="text-left p-3 font-medium"><Link href={buildSortLink("renewal")} className="hover:underline">Renewal{sortIcon("renewal")}</Link></th>
              <th className="text-left p-3 font-medium">Emails</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-muted-foreground">
                  No groups found. <Link href="/import" className="text-primary hover:underline">Import contacts</Link> to get started.
                </td>
              </tr>
            ) : (
              groups.map((group) => {
                const status = group.status as CompanyStatus;
                const colorClass = STATUS_COLORS[status] || "bg-gray-100 text-gray-600";
                const label = STATUS_LABELS[status] || status;
                return (
                  <tr key={group.id} className="border-t hover:bg-muted/50 cursor-pointer">
                    <td className="p-3">
                      <Link href={`/groups/${group.id}`} className="font-medium text-primary hover:underline">
                        {group.company_name || group.domain}
                      </Link>
                    </td>
                    <td className="p-3">
                      <a
                        href={`https://${group.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:underline text-xs"
                      >
                        {group.domain}
                      </a>
                    </td>
                    <td className="p-3">
                      {group.primary_contact_name ? (
                        <div>
                          <div>{group.primary_contact_name}</div>
                          {group.primary_contact_email && (
                            <div className="text-xs text-muted-foreground">{group.primary_contact_email}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${colorClass}`}>{label}</span>
                    </td>
                    <td className="p-3 text-muted-foreground text-xs">
                      {group.last_activity_at ? new Date(group.last_activity_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="p-3 text-muted-foreground text-xs">
                      {group.next_action_at ? new Date(group.next_action_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="p-3 text-muted-foreground text-xs">
                      {group.renewal_month ? getMonthName(group.renewal_month) : "—"}
                    </td>
                    <td className="p-3 text-muted-foreground text-xs">
                      {Number(group.email_count) > 0 ? Number(group.email_count) : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > limit && (
        <div className="flex gap-2 mt-4 items-center">
          {page > 1 && (
            <Link
              href={buildPageHref(page - 1)}
              className="px-3 py-1 border rounded text-sm hover:bg-muted"
            >
              Previous
            </Link>
          )}
          <span className="px-3 py-1 text-sm text-muted-foreground">Page {page} of {Math.ceil(total / limit)}</span>
          {page * limit < total && (
            <Link
              href={buildPageHref(page + 1)}
              className="px-3 py-1 border rounded text-sm hover:bg-muted"
            >
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
