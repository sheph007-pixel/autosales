"use server";

import { upsertAgentProfile } from "@autosales/core/services/agent-profile.service";
import { logAudit } from "@autosales/core/services/audit.service";
import { revalidatePath } from "next/cache";

export async function updateAgentProfileAction(data: {
  name?: string;
  company?: string;
  identity?: string | null;
  targetDescription?: string | null;
  offerDescription?: string | null;
  goals?: string | null;
  toneRules?: string | null;
  systemInstructions?: string | null;
  guardrails?: string | null;
}) {
  const updated = await upsertAgentProfile(data);
  await logAudit({
    entityType: "agent_profile",
    entityId: "singleton",
    action: "agent_profile_updated",
    details: { fields: Object.keys(data) },
    performedBy: "user",
  });
  revalidatePath("/settings");
  return updated;
}
