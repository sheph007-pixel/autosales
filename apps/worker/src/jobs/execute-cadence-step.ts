import type PgBoss from "pg-boss";
import { db, cadences, companies, contacts, enrollments, auditLogs } from "@autosales/db";
import { eq, and, sql } from "drizzle-orm";
import { buildCadenceContext, advanceEnrollment } from "@autosales/core/services/cadence.service";
import { groupMatchesCampaign } from "@autosales/core/services/campaign-targeting.service";
import { generateOutboundEmail } from "@autosales/ai";
import { logAudit } from "@autosales/core/services/audit.service";

interface ExecuteStepData {
  enrollmentId: string;
}

/**
 * Execute one step of a campaign enrollment.
 *
 * Safety properties:
 *  - Re-checks `campaign.isActive` (skip if paused) — prevents sending
 *    after a user pauses mid-tick.
 *  - Re-checks `company.status ∈ campaign.allowedStatuses` — prevents
 *    sending if the group's status changed between enrollment and execution
 *    (e.g. reply classified as has_broker → not_qualified).
 *  - Re-checks `doNotContact` on company AND contact.
 *  - Idempotent: uses an audit_logs row (keyed by enrollmentId + step) as
 *    the "already executed" marker. pg-boss retries are safe — at most
 *    one send-email job is queued per (enrollment, step) pair.
 *  - Writes the audit log BEFORE queuing send-email, so a crash between
 *    those two operations results in a MISSED send (safe) rather than a
 *    DOUBLE send (unsafe).
 */
export function makeExecuteCadenceStepHandler(boss: PgBoss) {
  return async function handleExecuteCadenceStep(job: PgBoss.Job<ExecuteStepData>) {
    const { enrollmentId } = job.data;
    console.log(`[execute] enrollment ${enrollmentId}`);

    // 1. Load enrollment
    const [enrollment] = await db
      .select()
      .from(enrollments)
      .where(eq(enrollments.id, enrollmentId))
      .limit(1);

    if (!enrollment) {
      console.log(`[execute] enrollment ${enrollmentId} not found, skipping`);
      return;
    }
    if (enrollment.status !== "active") {
      console.log(`[execute] enrollment ${enrollmentId} status=${enrollment.status}, skipping`);
      return;
    }

    // 2. Load campaign — defensive re-check of active flag
    const [campaign] = await db
      .select()
      .from(cadences)
      .where(eq(cadences.id, enrollment.cadenceId))
      .limit(1);

    if (!campaign) {
      console.log(`[execute] campaign ${enrollment.cadenceId} not found, skipping`);
      return;
    }
    if (!campaign.isActive) {
      console.log(`[execute] campaign "${campaign.name}" is paused, skipping`);
      return;
    }

    // 3. Load company + verify eligibility AT EXECUTION TIME
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, enrollment.companyId))
      .limit(1);

    if (!company) {
      console.log(`[execute] company ${enrollment.companyId} not found, skipping`);
      return;
    }
    if (company.doNotContact) {
      console.log(`[execute] company ${company.domain} is DNC, skipping`);
      return;
    }
    if (!groupMatchesCampaign(company, campaign)) {
      console.log(
        `[execute] company ${company.domain} status=${company.status} no longer matches campaign "${campaign.name}" (allowed: ${JSON.stringify(campaign.allowedStatuses)}), skipping`
      );
      return;
    }

    // 4. Load contact + DNC check
    const [contact] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, enrollment.contactId))
      .limit(1);

    if (!contact) {
      console.log(`[execute] contact ${enrollment.contactId} not found, skipping`);
      return;
    }
    if (contact.doNotContact) {
      console.log(`[execute] contact ${contact.email} is DNC, skipping`);
      return;
    }

    // 5. Idempotency check — have we already executed this step for this enrollment?
    const stepNumber = enrollment.currentStep;
    const existingLog = await db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, "cadence_step_executed"),
          eq(auditLogs.entityType, "campaign"),
          eq(auditLogs.entityId, campaign.id),
          sql`details->>'enrollmentId' = ${enrollmentId}`,
          sql`(details->>'step')::int = ${stepNumber}`
        )
      )
      .limit(1);

    if (existingLog.length > 0) {
      console.log(
        `[execute] step ${stepNumber} for enrollment ${enrollmentId} already executed, advancing only`
      );
      await advanceEnrollment(enrollmentId);
      return;
    }

    // 6. Build context (includes agent profile + campaign goal/instructions)
    const context = await buildCadenceContext(enrollmentId);
    if (!context) {
      console.log(`[execute] could not build context for ${enrollmentId}, skipping`);
      return;
    }

    // 7. Generate email
    const email = await generateOutboundEmail(context);
    console.log(`[execute] generated "${email.subject}" for ${context.contactEmail}`);

    // 8. Write audit log FIRST — this is the idempotency marker. A crash
    // between this and the boss.send below means the send is MISSED, not
    // duplicated. Missed sends are recoverable; double-sends to real people
    // are not.
    await logAudit({
      entityType: "campaign",
      entityId: campaign.id,
      action: "cadence_step_executed",
      details: {
        enrollmentId,
        step: stepNumber,
        companyId: context.companyId,
        contactEmail: context.contactEmail,
        subject: email.subject,
        reasoning: email.reasoning,
      },
      performedBy: "ai",
    });

    // 9. Queue the send
    await boss.send("send-email", {
      to: context.contactEmail,
      toName: context.contactName,
      subject: email.subject,
      body: email.body,
      companyId: context.companyId,
      contactId: context.contactId,
      enrollmentId,
    });
    console.log(`[execute] queued send-email for ${enrollmentId}`);

    // 10. Advance enrollment to next step
    await advanceEnrollment(enrollmentId);
  };
}
