import { db, ensureTables, cadences, cadenceSteps, enrollments, companies, contacts, auditLogs } from "@autosales/db";
import { eq, desc, sql, and } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { STATUS_LABELS, type CompanyStatus } from "@autosales/core";
import { resolveEligibleGroups, type CampaignFilter } from "@autosales/core/services/campaign-targeting.service";
import { CampaignControls } from "@/components/campaign-controls";

export const dynamic = "force-dynamic";

interface EnrollmentRow {
  id: string;
  companyId: string;
  companyName: string | null;
  domain: string;
  contactName: string;
  contactEmail: string;
  status: string;
  currentStep: number;
  nextStepAt: Date | null;
  startedAt: Date;
}

interface PreviewSample {
  companyId: string;
  companyName: string | null;
  domain: string;
  primaryContactName: string;
  primaryContactEmail: string;
}

export default async function CampaignDetailPage({ params }: { params: { id: string } }) {
  let campaign: typeof cadences.$inferSelect | null = null;
  let steps: Array<typeof cadenceSteps.$inferSelect> = [];
  let enrolled: EnrollmentRow[] = [];
  const counts = { active: 0, replied: 0, paused: 0, completed: 0, total: 0 };
  let emailsSent = 0;
  let matchedNow = 0;
  let preview: PreviewSample[] = [];
  let errorMessage: string | null = null;

  try {
    await ensureTables();
    const [row] = await db.select().from(cadences).where(eq(cadences.id, params.id)).limit(1);
    campaign = row ?? null;
    if (!campaign) notFound();

    steps = await db
      .select()
      .from(cadenceSteps)
      .where(eq(cadenceSteps.cadenceId, params.id))
      .orderBy(cadenceSteps.stepNumber);

    const joined = await db
      .select({
        id: enrollments.id,
        companyId: enrollments.companyId,
        companyName: companies.companyName,
        domain: companies.domain,
        contactName: contacts.name,
        contactEmail: contacts.email,
        status: enrollments.status,
        currentStep: enrollments.currentStep,
        nextStepAt: enrollments.nextStepAt,
        startedAt: enrollments.startedAt,
      })
      .from(enrollments)
      .innerJoin(companies, eq(companies.id, enrollments.companyId))
      .innerJoin(contacts, eq(contacts.id, enrollments.contactId))
      .where(eq(enrollments.cadenceId, params.id))
      .orderBy(desc(enrollments.startedAt))
      .limit(100);
    enrolled = joined as EnrollmentRow[];

    const statusCounts = await db
      .select({
        status: enrollments.status,
        count: sql<number>`count(*)::int`,
      })
      .from(enrollments)
      .where(eq(enrollments.cadenceId, params.id))
      .groupBy(enrollments.status);

    for (const row of statusCounts) {
      const n = Number(row.count);
      counts.total += n;
      if (row.status === "active") counts.active = n;
      else if (row.status === "replied") counts.replied = n;
      else if (row.status === "paused") counts.paused = n;
      else if (row.status === "completed") counts.completed = n;
    }

    // Emails sent — count cadence_step_executed audit logs for this campaign
    const emailsSentRows = (await db
      .select({ c: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, "cadence_step_executed"),
          eq(auditLogs.entityType, "campaign"),
          eq(auditLogs.entityId, params.id)
        )
      )) as Array<{ c: number }>;
    emailsSent = Number(emailsSentRows[0]?.c ?? 0);

    // Matched right now — same eligibility logic the scheduler uses
    try {
      const allowedStatuses = Array.isArray(campaign.allowedStatuses)
        ? (campaign.allowedStatuses as string[])
        : [];
      const filter = (campaign.filterJson ?? {}) as CampaignFilter;
      const eligible = await resolveEligibleGroups({
        allowedStatuses,
        filter,
        limit: 500,
      });
      matchedNow = eligible.length;
      preview = eligible.slice(0, 10).map((e) => ({
        companyId: e.company.id,
        companyName: e.company.companyName,
        domain: e.company.domain,
        primaryContactName: e.primaryContact!.name,
        primaryContactEmail: e.primaryContact!.email,
      }));
    } catch (err) {
      console.error("Campaign preview failed:", err);
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    console.error("Campaign detail page error:", err);
  }

  if (!campaign) notFound();
  const allowedStatuses = Array.isArray(campaign.allowedStatuses) ? campaign.allowedStatuses : [];
  const filter = (campaign.filterJson ?? {}) as Record<string, unknown>;

  return (
    <div className="max-w-6xl">
      <div className="mb-4">
        <Link href="/campaigns" className="text-sm text-muted-foreground hover:underline">
          &larr; Back to Campaigns
        </Link>
      </div>

      {errorMessage && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded">
          <p className="text-sm font-medium text-red-900">Error loading campaign:</p>
          <p className="text-xs text-red-700 mt-1 font-mono break-all">{errorMessage}</p>
        </div>
      )}

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{campaign.name}</h1>
          {campaign.description && (
            <p className="text-sm text-muted-foreground mt-1">{campaign.description}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`text-xs px-3 py-1 rounded-full ${
              campaign.isActive ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"
            }`}
          >
            {campaign.isActive ? "Active" : "Paused"}
          </span>
          <CampaignControls campaignId={campaign.id} isActive={campaign.isActive} />
        </div>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
        <div className="bg-card border rounded p-3">
          <div className="text-xs text-muted-foreground">Matches now</div>
          <div className="text-xl font-bold">{matchedNow}</div>
        </div>
        <div className="bg-card border rounded p-3">
          <div className="text-xs text-muted-foreground">Enrolled</div>
          <div className="text-xl font-bold">{counts.total}</div>
        </div>
        <div className="bg-card border rounded p-3">
          <div className="text-xs text-muted-foreground">Active</div>
          <div className="text-xl font-bold">{counts.active}</div>
        </div>
        <div className="bg-card border rounded p-3">
          <div className="text-xs text-muted-foreground">Emails sent</div>
          <div className="text-xl font-bold">{emailsSent}</div>
        </div>
        <div className="bg-card border rounded p-3">
          <div className="text-xs text-muted-foreground">Replies</div>
          <div className="text-xl font-bold">{counts.replied}</div>
        </div>
        <div className="bg-card border rounded p-3">
          <div className="text-xs text-muted-foreground">Completed</div>
          <div className="text-xl font-bold">{counts.completed}</div>
        </div>
      </div>

      {/* Target preview — what this campaign would hit on the next tick */}
      <section className="bg-card border rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Target preview</h2>
          <span className="text-xs text-muted-foreground">
            {matchedNow === 0
              ? "No groups match current filters"
              : `${matchedNow} group(s) eligible right now`}
          </span>
        </div>
        {!campaign.isActive && matchedNow > 0 && (
          <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900">
            Campaign is <strong>paused</strong>. No emails will be sent until you press Start.
          </div>
        )}
        {preview.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Nothing to preview.</p>
        ) : (
          <div className="divide-y">
            {preview.map((p) => (
              <div key={p.companyId} className="py-2 text-sm flex items-center justify-between">
                <div>
                  <Link href={`/groups/${p.companyId}`} className="font-medium text-primary hover:underline">
                    {p.companyName || p.domain}
                  </Link>
                  <span className="text-xs text-muted-foreground ml-2">{p.domain}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {p.primaryContactName} &lt;{p.primaryContactEmail}&gt;
                </div>
              </div>
            ))}
            {matchedNow > preview.length && (
              <div className="py-2 text-xs text-muted-foreground italic">
                + {matchedNow - preview.length} more
              </div>
            )}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 space-y-4">
          <section className="bg-card border rounded-lg p-4">
            <h2 className="font-semibold mb-2">Goal</h2>
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">
              {campaign.goal || <span className="italic">No goal set.</span>}
            </p>
          </section>
          <section className="bg-card border rounded-lg p-4">
            <h2 className="font-semibold mb-2">Campaign instructions</h2>
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">
              {campaign.instructions || (
                <span className="italic">No campaign-specific instructions. AI will use the global Agent Profile.</span>
              )}
            </p>
          </section>

          <section className="bg-card border rounded-lg p-4">
            <h2 className="font-semibold mb-2">Steps</h2>
            {steps.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No steps configured.</p>
            ) : (
              <div className="space-y-3">
                {steps.map((s) => (
                  <div key={s.id} className="border rounded p-3 text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">Step {s.stepNumber}</span>
                      <span className="text-xs text-muted-foreground">wait {s.delayDays}d</span>
                    </div>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                      {s.templatePrompt || <span className="italic">no prompt</span>}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-4">
          <section className="bg-card border rounded-lg p-4">
            <h2 className="font-semibold mb-2">Targeting</h2>
            <div className="text-sm space-y-1">
              <div>
                <span className="text-muted-foreground">Eligible statuses: </span>
                {allowedStatuses.length
                  ? allowedStatuses.map((s) => STATUS_LABELS[s as CompanyStatus] ?? s).join(", ")
                  : "—"}
              </div>
              {"renewalWithinDays" in filter && (
                <div>
                  <span className="text-muted-foreground">Renewal within: </span>
                  {String(filter.renewalWithinDays)} days
                </div>
              )}
              {"noReplyDays" in filter && (
                <div>
                  <span className="text-muted-foreground">No reply in: </span>
                  {String(filter.noReplyDays)} days
                </div>
              )}
            </div>
          </section>
          <section className="bg-card border rounded-lg p-4">
            <h2 className="font-semibold mb-2">Sending limits</h2>
            <div className="text-sm space-y-1">
              <div>
                <span className="text-muted-foreground">Daily: </span>
                {campaign.dailyLimit ?? "global default"}
              </div>
              <div>
                <span className="text-muted-foreground">Hourly: </span>
                {campaign.hourlyLimit ?? "global default"}
              </div>
              <div>
                <span className="text-muted-foreground">Min delay: </span>
                {campaign.minimumDelaySeconds != null ? `${campaign.minimumDelaySeconds}s` : "global default"}
              </div>
            </div>
          </section>
          <section className="bg-card border rounded-lg p-4">
            <h2 className="font-semibold mb-2">Schedule</h2>
            <div className="text-sm space-y-1">
              <div>
                <span className="text-muted-foreground">Last run: </span>
                {campaign.lastRunAt ? new Date(campaign.lastRunAt).toLocaleString() : "Never"}
              </div>
              <div>
                <span className="text-muted-foreground">Next run: </span>
                {campaign.isActive ? "Every 15 minutes (scheduler tick)" : "Paused"}
              </div>
            </div>
          </section>
        </div>
      </div>

      <section className="bg-card border rounded-lg overflow-hidden">
        <div className="p-3 border-b bg-muted">
          <h2 className="font-semibold text-sm">Groups in this campaign ({enrolled.length})</h2>
        </div>
        {enrolled.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No groups in this campaign yet. Once you Start it, the scheduler will pick up eligible groups on the next tick.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Group</th>
                <th className="text-left p-3 font-medium">Contact</th>
                <th className="text-left p-3 font-medium">On step</th>
                <th className="text-left p-3 font-medium">State</th>
                <th className="text-left p-3 font-medium">Next action</th>
              </tr>
            </thead>
            <tbody>
              {enrolled.map((e) => (
                <tr key={e.id} className="border-t hover:bg-muted/30">
                  <td className="p-3">
                    <Link
                      href={`/groups/${e.companyId}`}
                      className="text-primary hover:underline font-medium"
                    >
                      {e.companyName || e.domain}
                    </Link>
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">
                    <div>{e.contactName}</div>
                    <div>{e.contactEmail}</div>
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">{e.currentStep}</td>
                  <td className="p-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-foreground">
                      {e.status}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">
                    {e.nextStepAt ? new Date(e.nextStepAt).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
