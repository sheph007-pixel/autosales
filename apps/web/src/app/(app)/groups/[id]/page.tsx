import { db, ensureTables } from "@autosales/db";
import { sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { STATUS_LABELS, STATUS_COLORS, type CompanyStatus } from "@autosales/core";
import { GroupDetailView } from "@/components/group-detail-view";

export const dynamic = "force-dynamic";

export default async function GroupDetailPage(props: { params: { id: string } }) {
  try {
    return await renderGroupDetailPage(props);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error && err.stack ? err.stack : "";
    console.error("Group detail page fatal error:", err);
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4 text-red-900">Group detail — render failed</h1>
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

async function renderGroupDetailPage({ params }: { params: { id: string } }) {
  await ensureTables();

  // Fetch company
  interface GroupRow {
    id: string;
    domain: string;
    company_name: string | null;
    status: string;
    renewal_month: number | null;
    has_group_health_plan: boolean | null;
    do_not_contact: boolean;
  }

  let group: GroupRow | null = null;

  try {
    const rows = await db.execute(sql`
      SELECT id, domain, company_name, status, renewal_month, has_group_health_plan, do_not_contact
      FROM companies WHERE id = ${params.id}::uuid LIMIT 1
    `);
    group = (rows as unknown as GroupRow[])[0] ?? null;
  } catch {
    const rows = await db.execute(sql`
      SELECT id, domain, company_name, status, renewal_month, has_group_health_plan, do_not_contact
      FROM companies WHERE id = ${params.id}::uuid LIMIT 1
    `);
    group = (rows as unknown as GroupRow[])[0] ?? null;
  }

  if (!group) notFound();

  // Fetch contacts
  const contactRows = await db.execute(sql`
    SELECT id, name, email, title, phone
    FROM contacts WHERE company_id = ${params.id}::uuid
    ORDER BY created_at ASC
  `);
  const contacts = contactRows as unknown as Array<{
    id: string;
    name: string;
    email: string;
    title: string | null;
    phone: string | null;
  }>;

  // Fetch all emails for this group (including body_html and contact_id for filtering)
  const messageRows = await db.execute(sql`
    SELECT id, subject, direction, from_address, to_addresses, body_text, body_html, received_at, contact_id
    FROM email_messages WHERE company_id = ${params.id}::uuid
    ORDER BY received_at DESC LIMIT 200
  `);
  const messages = (messageRows as unknown as Array<{
    id: string;
    subject: string | null;
    direction: string;
    from_address: string;
    to_addresses: string;
    body_text: string | null;
    body_html: string | null;
    received_at: string;
    contact_id: string | null;
  }>).map((m) => ({
    ...m,
    to_addresses: typeof m.to_addresses === "object" ? JSON.stringify(m.to_addresses) : m.to_addresses,
  }));

  const status = group.status as CompanyStatus;
  const colorClass = STATUS_COLORS[status] || "bg-gray-100 text-gray-600";
  const label = STATUS_LABELS[status] || status;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/groups" className="text-sm text-muted-foreground hover:underline">&larr; Groups</Link>
          <span className="text-muted-foreground">/</span>
          <h1 className="text-xl font-bold">{group.company_name || group.domain}</h1>
          <a href={`https://${group.domain}`} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:underline">
            {group.domain}
          </a>
          <span className={`text-xs px-2 py-0.5 rounded-full ${colorClass}`}>{label}</span>
          {group.do_not_contact && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800">Paused</span>
          )}
        </div>
      </div>

      {/* Outlook-like layout */}
      <GroupDetailView
        group={{ id: group.id, domain: group.domain, company_name: group.company_name, status: group.status }}
        contacts={contacts}
        messages={messages}
      />
    </div>
  );
}
