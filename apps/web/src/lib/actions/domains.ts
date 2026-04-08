"use server";

import { updateCompanyStatus } from "@autosales/core/services/company.service";
import { logAudit } from "@autosales/core/services/audit.service";
import { revalidatePath } from "next/cache";

export async function updateDomainStatusAction(
  companyId: string,
  updates: {
    status?: string;
    interestStatus?: string;
    renewalMonth?: number | null;
    doNotContact?: boolean;
  }
) {
  await updateCompanyStatus(companyId, updates);
  await logAudit({
    entityType: "company",
    entityId: companyId,
    action: "status_updated",
    details: updates,
    performedBy: "user",
  });
  revalidatePath(`/domains/${companyId}`);
  revalidatePath("/domains");
}
