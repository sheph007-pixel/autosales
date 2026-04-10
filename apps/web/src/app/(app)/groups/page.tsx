import { db } from "@autosales/db";
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
  primary_contact: "pc.name",
  status: "c.status",
  last_activity: "c.last_activity_at",
  next_action: "c.next_action_at",
  renewal: "c.renewal_month",
};

export default async function GroupsPage({
  searchParams,
}: {
  searchParams: { search?: string; status?: string; sort?: string; dir?: string; page?: string };
}) {
  const page = Number(searchParams.page) || 1;
  const limit = 50;
  const offset = (page - 1) * limit;

  const sortCol = SORTABLE_COLUMNS[searchParams.sort || "name"] || SORTABLE_COLUMNS.name;
  const sortDir = searchParams.dir === "desc" ? "DESC" : "ASC";

  let groups: GroupRow[] = [];
  let total = 0;
  let stats = { lead: 0, current_client: 0, old_client: 0, not_qualified: 0 };

  try {
    const conditions: string[] = [];

    if (searchParams.status && COMPANY_STATUSES.includes(searchParams.status as CompanyStatus)) {
      conditions.push(`c.status = '${searchParams.status}'`);
    }

    if (searchParams.search) {
      const safe = searchParams.search.replace(/'/g, "''");
      conditions.push(`(
        c.company_name ILIKE '%${safe}%'
        OR c.domain ILIKE '%${safe}%'
        OR pc.name ILIKE '%${safe}%'
        OR pc.email ILIKE '%${safe}%'
      )`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await db.execute(sql.raw(
      `SELECT count(*) as count
       FROM companies c
       LEFT JOIN contacts pc ON pc.id = c.primary_contact_id
       ${whereClause}`
    ));
    total = Number((countResult as unknown as Array<{ count: string }>)[0]?.count ?? 0);

    const rows = await db.execute(sql.raw(
      `SELECT
         c.id,
         c.company_name,
         c.domain,
         c.status,
         c.renewal_month,
         c.last_activity_at,
         c.next_action_at,
         pc.name as primary_contact_name,
         pc.email as primary_contact_email,
         (SELECT count(*) FROM email_messages em WHERE em.company_id = c.id) as email_count
       FROM companies c
       LEFT JOIN contacts pc ON pc.id = c.primary_contact_id
       ${whereClause}
       ORDER BY ${sortCol} ${sortDir} NULLS LAST
       LIMIT ${limit} OFFSET ${offset}`
    ));
    groups = rows as unknown as GroupRow[];

    const statsResult = await db.execute(sql.raw(
      `SELECT status, count(*) as count FROM companies GROUP BY status`
    ));
    for (const row of statsResult as unknown as Array<{ status: string; count: string }>) {
      if (row.status in stats) (stats as Record<string, number>)[row.status] = Number(row.count);
    }
  } catch {
    // DB not ready yet
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

  return (
    <div>
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
                        onClick={(e) => e.stopPropagation()}
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
                      {Number(group.email_count) > 0 ? group.email_count : "—"}
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
              href={`/groups?${new URLSearchParams({ ...searchParams, page: String(page - 1) } as Record<string, string>).toString()}`}
              className="px-3 py-1 border rounded text-sm hover:bg-muted"
            >
              Previous
            </Link>
          )}
          <span className="px-3 py-1 text-sm text-muted-foreground">Page {page} of {Math.ceil(total / limit)}</span>
          {page * limit < total && (
            <Link
              href={`/groups?${new URLSearchParams({ ...searchParams, page: String(page + 1) } as Record<string, string>).toString()}`}
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
