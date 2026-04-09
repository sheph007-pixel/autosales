import { db } from "@autosales/db";
import { sql } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface LeadRow {
  id: string;
  name: string;
  email: string;
  title: string | null;
  company_name: string | null;
  domain: string;
  company_id: string;
  email_count: number;
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: { search?: string; page?: string };
}) {
  const page = Number(searchParams.page) || 1;
  const limit = 50;
  const offset = (page - 1) * limit;
  let leads: LeadRow[] = [];
  let total = 0;

  try {
    // Auto-fix names from metadata
    await db.execute(sql`
      UPDATE contacts SET
        name = TRIM(COALESCE(metadata->>'first_name', '') || ' ' || COALESCE(metadata->>'last_name', '')),
        updated_at = now()
      WHERE metadata IS NOT NULL
        AND (metadata->>'first_name' IS NOT NULL OR metadata->>'last_name' IS NOT NULL)
        AND TRIM(COALESCE(metadata->>'first_name', '') || ' ' || COALESCE(metadata->>'last_name', '')) != ''
        AND (name IS NULL OR name = '' OR name !~ ' ' OR length(name) < 3)
    `).catch(() => {});

    const search = searchParams.search;
    const searchFilter = search
      ? `WHERE c.name ILIKE '%${search.replace(/'/g, "''")}%' OR c.email ILIKE '%${search.replace(/'/g, "''")}%' OR co.company_name ILIKE '%${search.replace(/'/g, "''")}%' OR co.domain ILIKE '%${search.replace(/'/g, "''")}%'`
      : "";

    const countResult = await db.execute(sql.raw(
      `SELECT count(*) as count FROM contacts c LEFT JOIN companies co ON co.id = c.company_id ${searchFilter}`
    ));
    total = Number((countResult as unknown as Array<{ count: string }>)[0]?.count ?? 0);

    const rows = await db.execute(sql.raw(
      `SELECT c.id, c.name, c.email, c.title, c.company_id,
              co.company_name, co.domain,
              COALESCE((SELECT count(*) FROM email_messages em WHERE em.contact_id = c.id), 0) as email_count
       FROM contacts c
       LEFT JOIN companies co ON co.id = c.company_id
       ${searchFilter}
       ORDER BY c.name ASC
       LIMIT ${limit} OFFSET ${offset}`
    ));
    leads = rows as unknown as LeadRow[];
  } catch {
    // DB not ready
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Leads ({total})</h1>
        <div className="flex gap-2">
          <form className="flex gap-2">
            <input
              name="search"
              type="text"
              placeholder="Search name, email, company..."
              defaultValue={searchParams.search || ""}
              className="px-3 py-1.5 border rounded text-sm bg-background w-64"
            />
            <button type="submit" className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm">Search</button>
          </form>
          <Link href="/import" className="px-3 py-1.5 border rounded text-sm hover:bg-muted">Import CSV</Link>
        </div>
      </div>

      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left p-3 font-medium">Name</th>
              <th className="text-left p-3 font-medium">Company</th>
              <th className="text-left p-3 font-medium">Website</th>
              <th className="text-left p-3 font-medium">Emails</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-8 text-center text-muted-foreground">
                  No leads found. <Link href="/import" className="text-primary hover:underline">Import contacts</Link> to get started.
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr key={lead.id} className="border-t hover:bg-muted/50">
                  <td className="p-3">
                    <Link href={`/leads/${lead.id}`} className="font-medium text-primary hover:underline">
                      {lead.name}
                    </Link>
                    {lead.title && (
                      <p className="text-xs text-muted-foreground">{lead.title}</p>
                    )}
                  </td>
                  <td className="p-3">
                    <Link href={`/domains/${lead.company_id}`} className="hover:underline">
                      {lead.company_name || lead.domain}
                    </Link>
                  </td>
                  <td className="p-3">
                    <a
                      href={`https://${lead.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline text-xs"
                    >
                      {lead.domain}
                    </a>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {Number(lead.email_count) > 0 ? Number(lead.email_count) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > limit && (
        <div className="flex gap-2 mt-4">
          {page > 1 && (
            <Link href={`/contacts?page=${page - 1}${searchParams.search ? `&search=${searchParams.search}` : ""}`} className="px-3 py-1 border rounded text-sm hover:bg-muted">Previous</Link>
          )}
          <span className="px-3 py-1 text-sm text-muted-foreground">Page {page} of {Math.ceil(total / limit)}</span>
          {page * limit < total && (
            <Link href={`/contacts?page=${page + 1}${searchParams.search ? `&search=${searchParams.search}` : ""}`} className="px-3 py-1 border rounded text-sm hover:bg-muted">Next</Link>
          )}
        </div>
      )}
    </div>
  );
}
