import { pgTable, uuid, varchar, numeric, integer, boolean, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { emailMessages } from "./email-messages";
import { companies } from "./companies";

export const classifications = pgTable(
  "classifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => emailMessages.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    category: varchar("category", { length: 50 }).notNull(),
    confidence: numeric("confidence", { precision: 3, scale: 2 }).notNull(),
    renewalMonthDetected: integer("renewal_month_detected"),
    hasPlanDetected: boolean("has_plan_detected"),
    followUpDate: timestamp("follow_up_date", { withTimezone: true }),
    rawEvidence: text("raw_evidence"),
    extractedFacts: jsonb("extracted_facts").$type<Record<string, unknown>>().default({}),
    modelVersion: varchar("model_version", { length: 50 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_classifications_message").on(table.messageId),
    index("idx_classifications_company").on(table.companyId),
    index("idx_classifications_category").on(table.category),
  ]
);

export type Classification = typeof classifications.$inferSelect;
export type NewClassification = typeof classifications.$inferInsert;
