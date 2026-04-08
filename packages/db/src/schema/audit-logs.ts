import { pgTable, uuid, varchar, jsonb, timestamp, index } from "drizzle-orm/pg-core";

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: varchar("entity_type", { length: 50 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    action: varchar("action", { length: 100 }).notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().default({}),
    performedBy: varchar("performed_by", { length: 100 }).notNull().default("system"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_audit_entity").on(table.entityType, table.entityId),
    index("idx_audit_action").on(table.action),
    index("idx_audit_created").on(table.createdAt),
  ]
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
