"use server";

import {
  createCadence,
  updateCadence,
  setCadenceActive,
  deleteCadence,
  type CampaignInput,
} from "@autosales/core/services/cadence.service";
import { logAudit } from "@autosales/core/services/audit.service";
import { revalidatePath } from "next/cache";
import { COMPANY_STATUSES, type CompanyStatus } from "@autosales/core";

function sanitizeAllowedStatuses(raw: unknown): string[] {
  if (!Array.isArray(raw)) return ["lead"];
  const result = raw.filter(
    (s): s is string => typeof s === "string" && COMPANY_STATUSES.includes(s as CompanyStatus)
  );
  return result.length > 0 ? result : ["lead"];
}

export async function createCampaignAction(data: {
  name: string;
  description?: string;
  goal?: string;
  instructions?: string;
  allowedStatuses?: string[];
  filterJson?: Record<string, unknown>;
  dailyLimit?: number | null;
  hourlyLimit?: number | null;
  minimumDelaySeconds?: number | null;
  triggerType?: string;
  steps: { delayDays: number; templatePrompt: string }[];
}) {
  const input: CampaignInput = {
    name: data.name,
    description: data.description ?? null,
    goal: data.goal ?? null,
    instructions: data.instructions ?? null,
    allowedStatuses: sanitizeAllowedStatuses(data.allowedStatuses),
    filterJson: data.filterJson ?? {},
    dailyLimit: data.dailyLimit ?? null,
    hourlyLimit: data.hourlyLimit ?? null,
    minimumDelaySeconds: data.minimumDelaySeconds ?? null,
    triggerType: data.triggerType ?? "manual",
    steps: data.steps,
  };

  const campaign = await createCadence(input);
  await logAudit({
    entityType: "campaign",
    entityId: campaign.id,
    action: "campaign_created",
    details: { name: data.name },
    performedBy: "user",
  });
  revalidatePath("/campaigns");
  return campaign;
}

export async function updateCampaignAction(
  id: string,
  data: {
    name?: string;
    description?: string | null;
    goal?: string | null;
    instructions?: string | null;
    allowedStatuses?: string[];
    filterJson?: Record<string, unknown>;
    dailyLimit?: number | null;
    hourlyLimit?: number | null;
    minimumDelaySeconds?: number | null;
  }
) {
  const patch = {
    ...data,
    allowedStatuses:
      data.allowedStatuses !== undefined ? sanitizeAllowedStatuses(data.allowedStatuses) : undefined,
  };
  const updated = await updateCadence(id, patch);
  if (updated) {
    await logAudit({
      entityType: "campaign",
      entityId: id,
      action: "campaign_updated",
      details: data,
      performedBy: "user",
    });
  }
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${id}`);
  return updated;
}

export async function setCampaignActiveAction(id: string, isActive: boolean) {
  const updated = await setCadenceActive(id, isActive);
  if (updated) {
    await logAudit({
      entityType: "campaign",
      entityId: id,
      action: isActive ? "campaign_started" : "campaign_paused",
      details: {},
      performedBy: "user",
    });
  }
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${id}`);
  return updated;
}

export async function deleteCampaignAction(id: string) {
  await deleteCadence(id);
  await logAudit({
    entityType: "campaign",
    entityId: id,
    action: "campaign_deleted",
    details: {},
    performedBy: "user",
  });
  revalidatePath("/campaigns");
}
