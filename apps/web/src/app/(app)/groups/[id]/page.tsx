import { db, ensureTables } from "@autosales/db";
import { sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMonthName, STATUS_LABELS, STATUS_COLORS, type CompanyStatus } from "@autosales/core";
import { GroupActions } from "@/components/group-actions";

interface CampaignMembershipRow {
  enrollment_id: string;
  campaign_id: string;
  campaign_name: string;
  status: string;
  current_step: number;
  next_step_at: string | null;
  started_at: string;
}

export const dynamic = "force-dynamic";

interface GroupDetail {
  id: string;
  domain: string;
  company_name: string | null;
  status: string;
  renewal_month: number | null;
  has_group_health_plan: boolean | null;
  next_action_at: string | null;
  last_activity_at: string | null;
  do_not_contact: boolean;
  summary: string | null;
  primary_contact_id: string | null;
}

interface ContactRow {
  id: string;
  name: string;
  email: string;
  title: string | null;
  phone: string | null;
}

interface MessageRow {
  id: string;
  subject: string | null;
  direction: string;
  from_address: string;
  body_text: string | null;
  received_at: string;
}

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
  let group: GroupDetail | null = null;
  let contacts: ContactRow[] = [];
  let messages: MessageRow[] = [];
  type MemoryRow = { summary: string | null; conversation_status: string | null; next_steps: string | null };
  let memory: MemoryRow | null = null;
  let tasks: Array<{ id: string; description: string; type: string; status: string; due_at: string | null }> = [];
  let memberships: CampaignMembershipRow[] = [];

  try {
    await ensureTables();

    try {
      const groupRows = await db.execute(sql`
        SELECT id, domain, company_name, status, renewal_month, has_group_health_plan,
               next_action_at, last_activity_at, do_not_contact, summary, primary_contact_id
        FROM companies WHERE id = ${params.id}::uuid LIMIT 1
      `);
      group = (groupRows as unknown as GroupDetail[])[0] ?? null;
    } catch {
      // primary_contact_id column may not exist yet — fall back without it
      const groupRows = await db.execute(sql`
        SELECT id, domain, company_name, status, renewal_month, has_group_health_plan,
               next_action_at, last_activity_at, do_not_contact, summary
        FROM companies WHERE id = ${params.id}::uuid LIMIT 1
      `);
      const row = (groupRows as unknown as Omit<GroupDetail, "primary_contact_id">[])[0];
      group = row ? { ...row, primary_contact_id: null } : null;
    }

    if (group) {
      const contactRows = await db.execute(sql`
        SELECT id, name, email, title, phone
        FROM contacts WHERE company_id = ${params.id}::uuid
        ORDER BY created_at ASC
      `);
      contacts = contactRows as unknown as ContactRow[];

      const messageRows = await db.execute(sql`
        SELECT id, subject, direction, from_address, body_text, received_at
        FROM email_messages WHERE company_id = ${params.id}::uuid
        ORDER BY received_at DESC LIMIT 30
      `);
      messages = messageRows as unknown as MessageRow[];

      try {
        const memRows = await db.execute(sql`
          SELECT summary, conversation_status, next_steps
          FROM domain_memory WHERE company_id = ${params.id}::uuid LIMIT 1
        `);
        memory = (memRows as unknown as MemoryRow[])[0] ?? null;
      } catch {}

      try {
        const taskRows = await db.execute(sql`
          SELECT id, description, type, status, due_at
          FROM tasks WHERE company_id = ${params.id}::uuid
          ORDER BY created_at DESC LIMIT 20
        `);
        tasks = taskRows as unknown as typeof tasks;
      } catch {}

      try {
        const membershipRows = await db.execute(sql`
          SELECT e.id AS enrollment_id,
                 c.id AS campaign_id,
                 c.name AS campaign_name,
                 e.status,
                 e.current_step,
                 e.next_step_at,
                 e.started_at
          FROM enrollments e
          INNER JOIN cadences c ON c.id = e.cadence_id
          WHERE e.company_id = ${params.id}::uuid
          ORDER BY e.started_at DESC
        `);
        memberships = membershipRows as unknown as CampaignMembershipRow[];
      } catch {}
    }
  } catch {}

  if (!group) notFound();

  const status = group.status as CompanyStatus;
  const colorClass = STATUS_COLORS[status] || "bg-gray-100 text-gray-600";
  const label = STATUS_LABELS[status] || status;
  const primaryContact = contacts.find((c) => c.id === group?.primary_contact_id) || contacts[0] || null;
  const otherContacts = contacts.filter((c) => c.id !== primaryContact?.id);

  return (
    <div className="max-w-6xl">
      <div className="mb-4">
        <Link href="/groups" className="text-sm text-muted-foreground hover:underline">&larr; Back to Groups</Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{group.company_name || group.domain}</h1>
          <a href={`https://${group.domain}`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground text-sm hover:underline">
            {group.domain}
          </a>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-3 py-1 rounded-full ${colorClass}`}>{label}</span>
          {group.do_not_contact && (
            <span className="text-xs px-3 py-1 rounded-full bg-red-100 text-red-800">Paused</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Overview */}
          <div className="bg-card border rounded-lg p-4">
            <h2 className="font-semibold mb-3">Overview</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Status</p>
                <p className="font-medium">{label}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Renewal Month</p>
                <p className="font-medium">{group.renewal_month ? getMonthName(group.renewal_month) : "Unknown"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Has Group Plan</p>
                <p className="font-medium">
                  {group.has_group_health_plan === null ? "Unknown" : group.has_group_health_plan ? "Yes" : "No"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Last Activity</p>
                <p className="font-medium">
                  {group.last_activity_at ? new Date(group.last_activity_at).toLocaleDateString() : "Never"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Next Action</p>
                <p className="font-medium">
                  {group.next_action_at ? new Date(group.next_action_at).toLocaleDateString() : "None"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Total Contacts</p>
                <p className="font-medium">{contacts.length}</p>
              </div>
            </div>
          </div>

          {/* AI Memory */}
          <div className="bg-card border rounded-lg p-4">
            <h2 className="font-semibold mb-3">AI Memory</h2>
            {memory?.summary || group.summary ? (
              <div className="space-y-3 text-sm">
                <p>{memory?.summary || group.summary}</p>
                {memory?.conversation_status && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Conversation Status</p>
                    <p>{memory.conversation_status}</p>
                  </div>
                )}
                {memory?.next_steps && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Next Steps</p>
                    <p>{memory.next_steps}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No AI memory yet. Memory builds automatically as emails are synced and classified.
              </p>
            )}
          </div>

          {/* Email Timeline */}
          <div className="bg-card border rounded-lg p-4">
            <h2 className="font-semibold mb-3">Email Timeline ({messages.length})</h2>
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No emails synced for this group yet.</p>
            ) : (
              <div className="space-y-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`text-sm border-l-2 pl-3 py-1 ${
                      msg.direction === "inbound" ? "border-blue-400" : "border-green-400"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        msg.direction === "inbound" ? "bg-blue-50 text-blue-700" : "bg-green-50 text-green-700"
                      }`}>
                        {msg.direction === "inbound" ? "IN" : "OUT"}
                      </span>
                      <span className="font-medium">{msg.from_address}</span>
                      <span className="text-muted-foreground text-xs">
                        {new Date(msg.received_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="font-medium text-xs">{msg.subject || "(no subject)"}</p>
                    {msg.body_text && (
                      <p className="text-muted-foreground text-xs mt-1 line-clamp-2">
                        {msg.body_text.slice(0, 200)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Actions */}
          <GroupActions
            groupId={group.id}
            currentStatus={group.status}
            currentRenewalMonth={group.renewal_month}
            currentHasGroupHealthPlan={group.has_group_health_plan}
            currentPrimaryContactId={group.primary_contact_id}
            doNotContact={group.do_not_contact}
            contacts={contacts.map((c) => ({ id: c.id, name: c.name, email: c.email }))}
          />

          {/* Primary Contact */}
          <div className="bg-card border rounded-lg p-4">
            <h2 className="font-semibold mb-3">Primary Contact</h2>
            {primaryContact ? (
              <div className="text-sm space-y-1">
                <p className="font-medium">{primaryContact.name}</p>
                <p className="text-muted-foreground">{primaryContact.email}</p>
                {primaryContact.title && <p className="text-muted-foreground text-xs">{primaryContact.title}</p>}
                {primaryContact.phone && <p className="text-muted-foreground text-xs">{primaryContact.phone}</p>}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No primary contact set.</p>
            )}
          </div>

          {/* Other Contacts */}
          {otherContacts.length > 0 && (
            <div className="bg-card border rounded-lg p-4">
              <h2 className="font-semibold mb-3">Other Contacts ({otherContacts.length})</h2>
              <div className="space-y-3">
                {otherContacts.map((contact) => (
                  <div key={contact.id} className="text-sm">
                    <p className="font-medium">{contact.name}</p>
                    <p className="text-muted-foreground text-xs">{contact.email}</p>
                    {contact.title && <p className="text-muted-foreground text-xs">{contact.title}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Campaigns */}
          <div className="bg-card border rounded-lg p-4">
            <h2 className="font-semibold mb-3">Campaigns</h2>
            {memberships.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not in any campaigns.</p>
            ) : (
              <div className="space-y-2">
                {memberships.map((m) => (
                  <div key={m.enrollment_id} className="text-sm border-b pb-2 last:border-0">
                    <Link
                      href={`/campaigns/${m.campaign_id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {m.campaign_name}
                    </Link>
                    <p className="text-muted-foreground text-xs">
                      Step {m.current_step} · {m.status}
                      {m.next_step_at && ` · next ${new Date(m.next_step_at).toLocaleDateString()}`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tasks */}
          {tasks.length > 0 && (
            <div className="bg-card border rounded-lg p-4">
              <h2 className="font-semibold mb-3">Tasks</h2>
              <div className="space-y-2">
                {tasks.map((task) => (
                  <div key={task.id} className="text-sm border-b pb-2 last:border-0">
                    <p className="font-medium">{task.description}</p>
                    <p className="text-muted-foreground text-xs">{task.type} · {task.status}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
