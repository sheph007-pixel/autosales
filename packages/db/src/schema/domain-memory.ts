import { pgTable, uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { emailMessages } from "./email-messages";

export const domainMemory = pgTable("domain_memory", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: "cascade" }),
  summary: text("summary"),
  keyFacts: jsonb("key_facts").$type<Record<string, unknown>>().default({}),
  renewalInfo: jsonb("renewal_info").$type<Record<string, unknown>>().default({}),
  conversationStatus: text("conversation_status"),
  nextSteps: text("next_steps"),
  lastUpdatedFromMessageId: uuid("last_updated_from_message_id").references(
    () => emailMessages.id,
    { onDelete: "set null" }
  ),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DomainMemory = typeof domainMemory.$inferSelect;
export type NewDomainMemory = typeof domainMemory.$inferInsert;
