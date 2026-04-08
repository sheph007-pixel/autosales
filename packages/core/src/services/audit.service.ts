import { db, auditLogs } from "@autosales/db";

export async function logAudit(opts: {
  entityType: string;
  entityId: string;
  action: string;
  details?: Record<string, unknown>;
  performedBy?: string;
}) {
  await db.insert(auditLogs).values({
    entityType: opts.entityType,
    entityId: opts.entityId,
    action: opts.action,
    details: opts.details ?? {},
    performedBy: opts.performedBy ?? "system",
  });
}
