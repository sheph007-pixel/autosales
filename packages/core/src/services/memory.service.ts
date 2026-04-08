import { eq } from "drizzle-orm";
import { db, domainMemory } from "@autosales/db";
import type { DomainMemory, NewDomainMemory } from "@autosales/db";

export async function getMemory(companyId: string): Promise<DomainMemory | null> {
  const [memory] = await db
    .select()
    .from(domainMemory)
    .where(eq(domainMemory.companyId, companyId))
    .limit(1);
  return memory ?? null;
}

export async function upsertMemory(
  companyId: string,
  data: {
    summary: string;
    keyFacts?: Record<string, unknown>;
    renewalInfo?: Record<string, unknown>;
    conversationStatus?: string;
    nextSteps?: string;
    lastUpdatedFromMessageId?: string;
  }
): Promise<DomainMemory> {
  const existing = await getMemory(companyId);

  if (existing) {
    const [updated] = await db
      .update(domainMemory)
      .set({
        summary: data.summary,
        keyFacts: data.keyFacts ?? existing.keyFacts,
        renewalInfo: data.renewalInfo ?? existing.renewalInfo,
        conversationStatus: data.conversationStatus ?? existing.conversationStatus,
        nextSteps: data.nextSteps ?? existing.nextSteps,
        lastUpdatedFromMessageId: data.lastUpdatedFromMessageId ?? existing.lastUpdatedFromMessageId,
        updatedAt: new Date(),
      })
      .where(eq(domainMemory.id, existing.id))
      .returning();
    return updated!;
  }

  const [created] = await db
    .insert(domainMemory)
    .values({
      companyId,
      summary: data.summary,
      keyFacts: data.keyFacts ?? {},
      renewalInfo: data.renewalInfo ?? {},
      conversationStatus: data.conversationStatus ?? null,
      nextSteps: data.nextSteps ?? null,
      lastUpdatedFromMessageId: data.lastUpdatedFromMessageId ?? null,
    })
    .returning();

  return created!;
}
