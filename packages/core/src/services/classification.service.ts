import { eq } from "drizzle-orm";
import { db, classifications, companies, contacts, enrollments } from "@autosales/db";
import type { NewClassification } from "@autosales/db";
import type { ClassificationResult } from "../types/classification";
import { CONFIDENCE_THRESHOLDS } from "../types/classification";
import { parseFollowUpTiming } from "../utils/date-utils";

export async function saveClassification(
  messageId: string,
  companyId: string,
  result: ClassificationResult,
  modelVersion: string
) {
  const [classification] = await db
    .insert(classifications)
    .values({
      messageId,
      companyId,
      category: result.category,
      confidence: String(result.confidence),
      renewalMonthDetected: result.renewalMonthDetected,
      hasPlanDetected: result.hasPlanDetected,
      followUpDate: result.followUpDate ? new Date(result.followUpDate) : null,
      rawEvidence: result.evidence,
      extractedFacts: { reasoning: result.reasoning },
      modelVersion,
    })
    .returning();

  return classification!;
}

export async function applyClassification(
  companyId: string,
  contactId: string | null,
  result: ClassificationResult
) {
  if (result.confidence < CONFIDENCE_THRESHOLDS.FLAG_FOR_REVIEW) {
    return { action: "queued_for_review", applied: false };
  }

  const companyUpdates: Record<string, unknown> = { updatedAt: new Date() };
  const autoApply = result.confidence >= CONFIDENCE_THRESHOLDS.AUTO_APPLY;

  if (result.renewalMonthDetected) {
    companyUpdates.renewalMonth = result.renewalMonthDetected;
  }
  if (result.hasPlanDetected !== null && result.hasPlanDetected !== undefined) {
    companyUpdates.hasGroupHealthPlan = result.hasPlanDetected;
  }

  switch (result.category) {
    case "interested":
      companyUpdates.interestStatus = "interested";
      // Status stays as-is (lead → still lead until human qualifies)
      break;
    case "not_interested":
      companyUpdates.interestStatus = "not_interested";
      if (autoApply) companyUpdates.status = "not_qualified";
      break;
    case "follow_up_later":
      companyUpdates.interestStatus = "follow_up_later";
      if (result.followUpDate) {
        const followUpDate = parseFollowUpTiming(result.followUpDate);
        if (followUpDate) companyUpdates.nextActionAt = followUpDate;
      }
      break;
    case "wrong_person":
      if (contactId) {
        await db.update(contacts).set({ status: "wrong_person", updatedAt: new Date() }).where(eq(contacts.id, contactId));
      }
      companyUpdates.interestStatus = "wrong_contact";
      break;
    case "has_broker":
      companyUpdates.interestStatus = "has_broker";
      break;
    case "unsubscribe":
      companyUpdates.doNotContact = true;
      companyUpdates.status = "not_qualified";
      break;
  }

  if (Object.keys(companyUpdates).length > 1) {
    await db.update(companies).set(companyUpdates).where(eq(companies.id, companyId));
  }

  if (contactId && ["interested", "not_interested", "follow_up_later", "has_broker"].includes(result.category)) {
    await pauseActiveEnrollments(companyId);
  }

  return {
    action: autoApply ? "auto_applied" : "applied_with_review_flag",
    applied: true,
  };
}

async function pauseActiveEnrollments(companyId: string) {
  await db
    .update(enrollments)
    .set({ status: "replied" })
    .where(
      eq(enrollments.companyId, companyId)
    );
}
