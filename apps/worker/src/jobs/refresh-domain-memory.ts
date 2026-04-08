import type PgBoss from "pg-boss";
import { db, companies, contacts, emailMessages, classifications } from "@autosales/db";
import { eq, desc } from "drizzle-orm";
import { generateDomainSummary } from "@autosales/ai";
import { upsertMemory } from "@autosales/core/services/memory.service";
import { updateCompanyStatus } from "@autosales/core/services/company.service";

interface RefreshData {
  companyId: string;
}

export async function handleRefreshDomainMemory(job: PgBoss.Job<RefreshData>) {
  const { companyId } = job.data;
  console.log(`Refreshing domain memory for company ${companyId}...`);

  const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  if (!company) {
    console.log(`Company ${companyId} not found, skipping.`);
    return;
  }

  // Get contacts
  const companyContacts = await db
    .select()
    .from(contacts)
    .where(eq(contacts.companyId, companyId));

  // Get recent emails
  const recentEmails = await db
    .select()
    .from(emailMessages)
    .where(eq(emailMessages.companyId, companyId))
    .orderBy(desc(emailMessages.receivedAt))
    .limit(20);

  if (recentEmails.length === 0) {
    console.log(`No emails for company ${companyId}, skipping memory refresh.`);
    return;
  }

  // Get classifications
  const messageIds = recentEmails.map((e) => e.id);
  const classificationResults = await db
    .select()
    .from(classifications)
    .where(eq(classifications.companyId, companyId));

  // Generate summary
  const summary = await generateDomainSummary({
    domain: company.domain,
    companyName: company.companyName,
    contacts: companyContacts.map((c) => ({
      name: c.name,
      email: c.email,
      title: c.title,
    })),
    recentEmails: recentEmails.map((e) => ({
      direction: e.direction,
      from: e.fromAddress,
      subject: e.subject ?? "",
      bodyPreview: (e.bodyText ?? "").slice(0, 300),
      date: e.receivedAt.toISOString(),
    })),
    existingSummary: company.summary,
    classifications: classificationResults.map((c) => ({
      category: c.category,
      evidence: c.rawEvidence,
    })),
  });

  // Upsert memory
  await upsertMemory(companyId, {
    summary: summary.summary,
    keyFacts: summary.keyFacts,
    renewalInfo: summary.renewalInfo,
    conversationStatus: summary.conversationStatus,
    nextSteps: summary.nextSteps,
    lastUpdatedFromMessageId: recentEmails[0]?.id,
  });

  // Update company summary
  await updateCompanyStatus(companyId, { summary: summary.summary });

  // Apply renewal info if found
  if (summary.renewalInfo.month && summary.renewalInfo.confidence >= 0.7) {
    await updateCompanyStatus(companyId, { renewalMonth: summary.renewalInfo.month });
  }

  console.log(`Domain memory refreshed for ${company.domain}`);
}
