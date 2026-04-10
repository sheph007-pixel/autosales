"use server";

import { db } from "@autosales/db";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { COMPANY_STATUSES, type CompanyStatus } from "@autosales/core";

export async function updateGroupAction(
  groupId: string,
  updates: {
    status?: string;
    renewalMonth?: number | null;
    hasGroupHealthPlan?: boolean | null;
    primaryContactId?: string | null;
    doNotContact?: boolean;
  }
) {
  // Validate status
  if (updates.status && !COMPANY_STATUSES.includes(updates.status as CompanyStatus)) {
    throw new Error(`Invalid status: ${updates.status}`);
  }

  const setClauses: string[] = [];
  const values: Record<string, unknown> = {};

  if (updates.status !== undefined) {
    setClauses.push(`status = '${updates.status}'`);
  }
  if (updates.renewalMonth !== undefined) {
    setClauses.push(updates.renewalMonth === null ? `renewal_month = NULL` : `renewal_month = ${Number(updates.renewalMonth)}`);
  }
  if (updates.hasGroupHealthPlan !== undefined) {
    setClauses.push(updates.hasGroupHealthPlan === null ? `has_group_health_plan = NULL` : `has_group_health_plan = ${updates.hasGroupHealthPlan}`);
  }
  if (updates.primaryContactId !== undefined) {
    if (updates.primaryContactId === null) {
      setClauses.push(`primary_contact_id = NULL`);
    } else {
      // Validate UUID format
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(updates.primaryContactId)) {
        throw new Error("Invalid contact id");
      }
      setClauses.push(`primary_contact_id = '${updates.primaryContactId}'::uuid`);
    }
  }
  if (updates.doNotContact !== undefined) {
    setClauses.push(`do_not_contact = ${updates.doNotContact}`);
  }

  if (setClauses.length === 0) return;

  setClauses.push(`updated_at = now()`);

  // Validate UUID
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(groupId)) {
    throw new Error("Invalid group id");
  }

  await db.execute(sql.raw(
    `UPDATE companies SET ${setClauses.join(", ")} WHERE id = '${groupId}'::uuid`
  ));

  revalidatePath(`/groups/${groupId}`);
  revalidatePath("/groups");
}
