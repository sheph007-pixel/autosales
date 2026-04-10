import { db, agentProfile } from "@autosales/db";
import type { AgentProfile } from "@autosales/db";
import { eq } from "drizzle-orm";

const SINGLETON_KEY = true;

export async function getAgentProfile(): Promise<AgentProfile | null> {
  const [row] = await db
    .select()
    .from(agentProfile)
    .where(eq(agentProfile.singleton, SINGLETON_KEY))
    .limit(1);
  return row ?? null;
}

export async function upsertAgentProfile(data: {
  name?: string;
  company?: string;
  identity?: string | null;
  targetDescription?: string | null;
  offerDescription?: string | null;
  goals?: string | null;
  toneRules?: string | null;
  systemInstructions?: string | null;
  guardrails?: string | null;
}): Promise<AgentProfile> {
  const existing = await getAgentProfile();
  if (!existing) {
    const [inserted] = await db
      .insert(agentProfile)
      .values({
        singleton: SINGLETON_KEY,
        name: data.name ?? "Hunter Shepherd",
        company: data.company ?? "Kennion",
        identity: data.identity ?? null,
        targetDescription: data.targetDescription ?? null,
        offerDescription: data.offerDescription ?? null,
        goals: data.goals ?? null,
        toneRules: data.toneRules ?? null,
        systemInstructions: data.systemInstructions ?? null,
        guardrails: data.guardrails ?? null,
      })
      .returning();
    return inserted!;
  }

  const [updated] = await db
    .update(agentProfile)
    .set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.company !== undefined ? { company: data.company } : {}),
      ...(data.identity !== undefined ? { identity: data.identity } : {}),
      ...(data.targetDescription !== undefined ? { targetDescription: data.targetDescription } : {}),
      ...(data.offerDescription !== undefined ? { offerDescription: data.offerDescription } : {}),
      ...(data.goals !== undefined ? { goals: data.goals } : {}),
      ...(data.toneRules !== undefined ? { toneRules: data.toneRules } : {}),
      ...(data.systemInstructions !== undefined ? { systemInstructions: data.systemInstructions } : {}),
      ...(data.guardrails !== undefined ? { guardrails: data.guardrails } : {}),
      updatedAt: new Date(),
    })
    .where(eq(agentProfile.singleton, SINGLETON_KEY))
    .returning();
  return updated!;
}
