import { db } from "@autosales/db";
import { sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

interface ContactDetail {
  id: string;
  name: string;
  email: string;
  title: string | null;
  phone: string | null;
  status: string;
  company_id: string;
  company_name: string | null;
  domain: string;
  metadata: Record<string, string> | null;
  created_at: string;
}

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  let contact: ContactDetail | null = null;
  let emails: Array<{ id: string; subject: string | null; direction: string; received_at: string; from_address: string }> = [];

  try {
    const rows = await db.execute(sql`
      SELECT c.*, co.company_name, co.domain
      FROM contacts c
      LEFT JOIN companies co ON co.id = c.company_id
      WHERE c.id = ${params.id}::uuid
      LIMIT 1
    `);
    contact = (rows as unknown as ContactDetail[])[0] ?? null;

    if (contact) {
      const emailRows = await db.execute(sql`
        SELECT id, subject, direction, received_at, from_address
        FROM email_messages
        WHERE contact_id = ${params.id}::uuid
        ORDER BY received_at DESC
        LIMIT 50
      `);
      emails = emailRows as unknown as typeof emails;
    }
  } catch {}

  if (!contact) notFound();

  const meta = contact.metadata || {};
  const metaEntries = Object.entries(meta).filter(([k, v]) => v && !["first_name", "last_name", "name", "id"].includes(k));

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <Link href="/contacts" className="text-sm text-muted-foreground hover:underline">&larr; Back to Leads</Link>
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{contact.name}</h1>
          <p className="text-muted-foreground">{contact.email}</p>
          {contact.title && <p className="text-sm text-muted-foreground">{contact.title}</p>}
        </div>
        <span className={`text-xs px-3 py-1 rounded-full ${
          contact.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
        }`}>
          {contact.status}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contact Info */}
        <div className="bg-card border rounded-lg p-4">
          <h2 className="font-semibold mb-3">Contact Info</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span>{contact.email}</span>
            </div>
            {contact.phone && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Phone</span>
                <span>{contact.phone}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Company</span>
              <Link href={`/domains/${contact.company_id}`} className="text-primary hover:underline">
                {contact.company_name || contact.domain}
              </Link>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Website</span>
              <a href={`https://${contact.domain}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                {contact.domain}
              </a>
            </div>
          </div>
        </div>

        {/* Email History */}
        <div className="bg-card border rounded-lg p-4">
          <h2 className="font-semibold mb-3">Emails ({emails.length})</h2>
          {emails.length === 0 ? (
            <p className="text-sm text-muted-foreground">No email history yet. Sync Outlook to pull in conversations.</p>
          ) : (
            <div className="space-y-2">
              {emails.map((e) => (
                <div key={e.id} className={`text-sm border-l-2 pl-3 py-1 ${e.direction === "inbound" ? "border-blue-400" : "border-green-400"}`}>
                  <span className={`text-xs px-1 rounded ${e.direction === "inbound" ? "bg-blue-50 text-blue-700" : "bg-green-50 text-green-700"}`}>
                    {e.direction === "inbound" ? "IN" : "OUT"}
                  </span>
                  <span className="ml-2 font-medium">{e.subject || "(no subject)"}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{new Date(e.received_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* All Imported Data */}
        {metaEntries.length > 0 && (
          <div className="bg-card border rounded-lg p-4 lg:col-span-2">
            <h2 className="font-semibold mb-3">All Imported Fields</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
              {metaEntries.map(([key, value]) => (
                <div key={key} className="truncate">
                  <span className="text-muted-foreground">{key}:</span>{" "}
                  <span title={value}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
