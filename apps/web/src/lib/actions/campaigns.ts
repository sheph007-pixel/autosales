"use server";

import {
  createCadence,
  updateCadence,
  setCadenceActive,
  deleteCadence,
  type CampaignInput,
} from "@autosales/core/services/cadence.service";
import { resolveEligibleGroups } from "@autosales/core/services/campaign-targeting.service";
import { logAudit } from "@autosales/core/services/audit.service";
import { revalidatePath } from "next/cache";
import { COMPANY_STATUSES, type CompanyStatus } from "@autosales/core";
import { ensureTables } from "@autosales/db";

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
    // triggerType is internal-only ("manual" default); not exposed in UI
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

export interface CampaignPreviewResult {
  matched: number;
  sample: Array<{
    companyId: string;
    companyName: string | null;
    domain: string;
    status: string;
    primaryContactName: string;
    primaryContactEmail: string;
  }>;
}

/**
 * Dry-run: compute which Groups a campaign would target RIGHT NOW given
 * the supplied status + filter settings. Returns a matched count and a
 * sample of up to 10 groups with their resolved primary contact.
 *
 * This reuses the exact same eligibility logic the scheduler uses, so
 * what the user sees here is what would actually be enrolled.
 */
export async function previewCampaignTargetingAction(input: {
  allowedStatuses?: string[];
  filterJson?: Record<string, unknown>;
}): Promise<CampaignPreviewResult> {
  await ensureTables();
  const allowedStatuses = sanitizeAllowedStatuses(input.allowedStatuses);
  const filter = (input.filterJson ?? {}) as {
    renewalWithinDays?: number;
    noReplyDays?: number;
  };

  const eligible = await resolveEligibleGroups({
    allowedStatuses,
    filter,
    limit: 500,
  });

  return {
    matched: eligible.length,
    sample: eligible.slice(0, 10).map((e) => ({
      companyId: e.company.id,
      companyName: e.company.companyName,
      domain: e.company.domain,
      status: e.company.status,
      primaryContactName: e.primaryContact!.name,
      primaryContactEmail: e.primaryContact!.email,
    })),
  };
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
