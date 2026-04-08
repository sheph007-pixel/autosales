import type PgBoss from "pg-boss";
import { db, emailMessages, companies, contacts, classifications } from "@autosales/db";
import { eq } from "drizzle-orm";
import { classifyReply, extractFacts } from "@autosales/ai";
import { saveClassification, applyClassification } from "@autosales/core/services/classification.service";
import { updateCompanyStatus } from "@autosales/core/services/company.service";
import { findOrCreateContact } from "@autosales/core/services/contact.service";
import { logAudit } from "@autosales/core/services/audit.service";

interface ClassifyMessageData {
  messageId: string;
}

export async function handleClassifyMessage(job: PgBoss.Job<ClassifyMessageData>) {
  const { messageId } = job.data;
  console.log(`Classifying message ${messageId}...`);

  const [message] = await db
    .select()
    .from(emailMessages)
    .where(eq(emailMessages.id, messageId))
    .limit(1);

  if (!message) {
    console.log(`Message ${messageId} not found, skipping.`);
    return;
  }

  // Skip outbound messages
  if (message.direction !== "inbound") {
    console.log(`Message ${messageId} is outbound, skipping classification.`);
    return;
  }

  // Check if already classified
  const [existing] = await db
    .select()
    .from(classifications)
    .where(eq(classifications.messageId, messageId))
    .limit(1);

  if (existing) {
    console.log(`Message ${messageId} already classified, skipping.`);
    return;
  }

  // Get company info for context
  let domainSummary: string | undefined;
  if (message.companyId) {
    const [company] = await db.select().from(companies).where(eq(companies.id, message.companyId)).limit(1);
    if (company?.summary) domainSummary = company.summary;
  }

  const domain = message.fromAddress.split("@")[1] ?? "";

  // Classify
  const classification = await classifyReply({
    emailBody: message.bodyText ?? "",
    subject: message.subject ?? "",
    fromName: message.fromAddress,
    fromEmail: message.fromAddress,
    domain,
    priorContext: domainSummary,
  });

  // Save classification
  await saveClassification(messageId, message.companyId ?? "", classification, "gpt-4o");

  // Apply classification to company/contact state
  if (message.companyId) {
    const result = await applyClassification(
      message.companyId,
      message.contactId,
      classification
    );
    console.log(`Classification applied: ${classification.category} (${classification.confidence}) -> ${result.action}`);
  }

  // Extract facts
  try {
    const facts = await extractFacts({
      emailBody: message.bodyText ?? "",
      subject: message.subject ?? "",
      fromName: message.fromAddress,
      fromEmail: message.fromAddress,
      domain,
    });

    // Apply extracted facts to company
    if (message.companyId) {
      const updates: Record<string, unknown> = {};
      if (facts.renewalMonth) updates.renewalMonth = facts.renewalMonth;
      if (facts.hasGroupHealthPlan !== null) updates.hasGroupHealthPlan = facts.hasGroupHealthPlan;
      if (facts.companyName) updates.companyName = facts.companyName;

      if (Object.keys(updates).length > 0) {
        await updateCompanyStatus(message.companyId, updates);
      }

      // Update contact title if found
      if (message.contactId && facts.contactTitle) {
        await db.update(contacts).set({ title: facts.contactTitle, updatedAt: new Date() }).where(eq(contacts.id, message.contactId));
      }
    }
  } catch (err) {
    console.error("Fact extraction failed:", err);
    // Non-fatal — classification already saved
  }

  await logAudit({
    entityType: "email_message",
    entityId: messageId,
    action: "message_classified",
    details: {
      category: classification.category,
      confidence: classification.confidence,
    },
    performedBy: "ai",
  });
}
