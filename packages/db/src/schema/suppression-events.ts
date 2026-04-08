import { pgTable, uuid, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { contacts } from "./contacts";

export const suppressionEvents = pgTable(
  "suppression_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    reason: varchar("reason", { length: 100 }).notNull(),
    source: varchar("source", { length: 50 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_suppression_company").on(table.companyId),
  ]
);

export type SuppressionEvent = typeof suppressionEvents.$inferSelect;
export type NewSuppressionEvent = typeof suppressionEvents.$inferInsert;
