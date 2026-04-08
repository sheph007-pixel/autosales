"use server";

import { createCadence, enrollContact } from "@autosales/core/services/cadence.service";
import { logAudit } from "@autosales/core/services/audit.service";
import { revalidatePath } from "next/cache";

export async function createCadenceAction(data: {
  name: string;
  description?: string;
  triggerType?: string;
  steps: { delayDays: number; actionType?: string; templatePrompt: string }[];
}) {
  const cadence = await createCadence(data);
  await logAudit({
    entityType: "cadence",
    entityId: cadence.id,
    action: "cadence_created",
    details: { name: data.name },
    performedBy: "user",
  });
  revalidatePath("/cadences");
  return cadence;
}

export async function enrollContactAction(opts: {
  cadenceId: string;
  companyId: string;
  contactId: string;
}) {
  const enrollment = await enrollContact(opts);
  await logAudit({
    entityType: "enrollment",
    entityId: enrollment.id,
    action: "contact_enrolled",
    details: opts,
    performedBy: "user",
  });
  revalidatePath(`/domains/${opts.companyId}`);
  return enrollment;
}
