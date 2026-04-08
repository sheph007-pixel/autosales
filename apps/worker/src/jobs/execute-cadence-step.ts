import type PgBoss from "pg-boss";
import { db, companies, contacts, enrollments } from "@autosales/db";
import { eq, and } from "drizzle-orm";
import { buildCadenceContext, advanceEnrollment } from "@autosales/core/services/cadence.service";
import { generateOutboundEmail } from "@autosales/ai";
import { logAudit } from "@autosales/core/services/audit.service";

interface ExecuteStepData {
  enrollmentId: string;
}

export async function handleExecuteCadenceStep(job: PgBoss.Job<ExecuteStepData>) {
  const { enrollmentId } = job.data;
  console.log(`Executing cadence step for enrollment ${enrollmentId}...`);

  // Check enrollment is still active
  const [enrollment] = await db
    .select()
    .from(enrollments)
    .where(eq(enrollments.id, enrollmentId))
    .limit(1);

  if (!enrollment || enrollment.status !== "active") {
    console.log(`Enrollment ${enrollmentId} not active, skipping.`);
    return;
  }

  // Check company is not suppressed
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, enrollment.companyId))
    .limit(1);

  if (!company || company.doNotContact) {
    console.log(`Company ${enrollment.companyId} is DNC or not found, skipping.`);
    return;
  }

  // Check contact is not suppressed
  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, enrollment.contactId))
    .limit(1);

  if (!contact || contact.doNotContact) {
    console.log(`Contact ${enrollment.contactId} is DNC or not found, skipping.`);
    return;
  }

  // Build context
  const context = await buildCadenceContext(enrollmentId);
  if (!context) {
    console.log(`Could not build context for enrollment ${enrollmentId}, skipping.`);
    return;
  }

  // Generate email
  const email = await generateOutboundEmail(context);
  console.log(`Generated email: "${email.subject}" (reason: ${email.reasoning})`);

  // Queue the send-email job (separate job for actual sending)
  // In a real setup, we'd use boss.send() here. For now, log it.
  console.log(`[SEND QUEUED] To: ${context.contactEmail}, Subject: ${email.subject}`);

  // Advance enrollment to next step
  await advanceEnrollment(enrollmentId);

  await logAudit({
    entityType: "enrollment",
    entityId: enrollmentId,
    action: "cadence_step_executed",
    details: {
      step: enrollment.currentStep,
      subject: email.subject,
      contactEmail: context.contactEmail,
    },
    performedBy: "ai",
  });
}
