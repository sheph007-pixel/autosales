import { db } from "@autosales/db";
import { sql } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface ContactRow {
  id: string;
  name: string;
  email: string;
  title: string | null;
  phone: string | null;
  status: string;
  company_name: string | null;
  domain: string;
  company_id: string;
  last_replied_at: string | null;
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: { search?: string; page?: string };
}) {
  const page = Number(searchParams.page) || 1;
  const limit = 50;
  const offset = (page - 1) * limit;
  let contacts: ContactRow[] = [];
  let total = 0;

  try {
    // Auto-fix names from metadata on first load
    await db.execute(sql`
      UPDATE contacts SET
        name = TRIM(COALESCE(metadata->>'first_name', '') || ' ' || COALESCE(metadata->>'last_name', '')),
        updated_at = now()
      WHERE metadata IS NOT NULL
        AND (metadata->>'first_name' IS NOT NULL OR metadata->>'last_name' IS NOT NULL)
        AND TRIM(COALESCE(metadata->>'first_name', '') || ' ' || COALESCE(metadata->>'last_name', '')) != ''
        AND (name IS NULL OR name = '' OR name !~ ' ' OR length(name) < 3)
    `).catch(() => {});

    // Query contacts with company info
    const search = searchParams.search;
    let whereClause = "";
    if (search) {
      whereClause = `WHERE c.name ILIKE '%${search.replace(/'/g, "''")}%' OR c.email ILIKE '%${search.replace(/'/g, "''")}%' OR co.company_name ILIKE '%${search.replace(/'/g, "''")}%' OR co.domain ILIKE '%${search.replace(/'/g, "''")}%'`;
    }

    const countResult = await db.execute(sql.raw(
      `SELECT count(*) as count FROM contacts c LEFT JOIN companies co ON co.id = c.company_id ${whereClause}`
    ));
    total = Number((countResult as unknown as Array<{ count: string }>)[0]?.count ?? 0);

    const rows = await db.execute(sql.raw(
      `SELECT c.id, c.name, c.email, c.title, c.phone, c.status, c.company_id, c.last_replied_at,
              co.company_name, co.domain
       FROM contacts c
       LEFT JOIN companies co ON co.id = c.company_id
       ${whereClause}
       ORDER BY c.name ASC
       LIMIT ${limit} OFFSET ${offset}`
    ));
    contacts = rows as unknown as ContactRow[];
  } catch {
    // DB not ready
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Contacts ({total})</h1>
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
      </div>

      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left p-3 font-medium">Name</th>
              <th className="text-left p-3 font-medium">Email</th>
              <th className="text-left p-3 font-medium">Company</th>
              <th className="text-left p-3 font-medium">Domain</th>
              <th className="text-left p-3 font-medium">Title</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-left p-3 font-medium">Last Replied</th>
            </tr>
          </thead>
          <tbody>
            {contacts.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  No contacts found.
                </td>
              </tr>
            ) : (
              contacts.map((contact) => (
                <tr key={contact.id} className="border-t hover:bg-muted/50">
                  <td className="p-3 font-medium">{contact.name}</td>
                  <td className="p-3 text-muted-foreground">{contact.email}</td>
                  <td className="p-3">
                    <Link href={`/domains/${contact.company_id}`} className="text-primary hover:underline">
                      {contact.company_name || "—"}
                    </Link>
                  </td>
                  <td className="p-3 text-muted-foreground">{contact.domain}</td>
                  <td className="p-3 text-muted-foreground">{contact.title ?? "—"}</td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      contact.status === "active" ? "bg-green-100 text-green-800" :
                      contact.status === "wrong_person" ? "bg-yellow-100 text-yellow-800" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {contact.status}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">
                    {contact.last_replied_at ? new Date(contact.last_replied_at).toLocaleDateString() : "—"}
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
