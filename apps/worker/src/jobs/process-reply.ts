import type PgBoss from "pg-boss";
import { db, emailMessages, companies, enrollments } from "@autosales/db";
import { eq, and } from "drizzle-orm";
import { classifyReply } from "@autosales/ai";
import { saveClassification, applyClassification } from "@autosales/core/services/classification.service";
import { pauseCompanyEnrollments } from "@autosales/core/services/cadence.service";
import { createTask } from "@autosales/core/services/task.service";
import { logAudit } from "@autosales/core/services/audit.service";
import { CONFIDENCE_THRESHOLDS } from "@autosales/core";

interface ProcessReplyData {
  messageId: string;
}

export async function handleProcessReply(job: PgBoss.Job<ProcessReplyData>) {
  const { messageId } = job.data;
  console.log(`Processing reply ${messageId}...`);

  const [message] = await db
    .select()
    .from(emailMessages)
    .where(eq(emailMessages.id, messageId))
    .limit(1);

  if (!message || message.direction !== "inbound") {
    console.log(`Message ${messageId} not found or not inbound, skipping.`);
    return;
  }

  const domain = message.fromAddress.split("@")[1] ?? "";

  // Get company context
  let domainSummary: string | undefined;
  if (message.companyId) {
    const [company] = await db.select().from(companies).where(eq(companies.id, message.companyId)).limit(1);
    if (company?.summary) domainSummary = company.summary;
  }

  // Classify
  const classification = await classifyReply({
    emailBody: message.bodyText ?? "",
    subject: message.subject ?? "",
    fromName: message.fromAddress,
    fromEmail: message.fromAddress,
    domain,
    priorContext: domainSummary,
  });

  // Save
  await saveClassification(messageId, message.companyId ?? "", classification, "gpt-4o");

  // Apply
  if (message.companyId) {
    const result = await applyClassification(message.companyId, message.contactId, classification);

    // Pause active enrollments on any meaningful reply
    if (["interested", "not_interested", "follow_up_later", "has_broker", "wrong_person", "unsubscribe"].includes(classification.category)) {
      await pauseCompanyEnrollments(message.companyId, "replied");
    }

    // Create human review task if confidence is low
    if (classification.confidence < CONFIDENCE_THRESHOLDS.AUTO_APPLY) {
      await createTask({
        companyId: message.companyId,
        contactId: message.contactId ?? undefined,
        type: "human_review",
        description: `Review AI classification: "${classification.category}" (${(classification.confidence * 100).toFixed(0)}% confidence) — ${classification.evidence}`,
      });
    }

    // Create follow-up task for interested replies
    if (classification.category === "interested") {
      await createTask({
        companyId: message.companyId,
        contactId: message.contactId ?? undefined,
        type: "follow_up",
        description: `Interested reply from ${message.fromAddress}: "${classification.evidence}"`,
      });
    }
  }

  await logAudit({
    entityType: "email_message",
    entityId: messageId,
    action: "reply_processed",
    details: {
      category: classification.category,
      confidence: classification.confidence,
    },
    performedBy: "ai",
  });
}
