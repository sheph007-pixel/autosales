import { pgTable, uuid, varchar, integer, boolean, text, timestamp, index } from "drizzle-orm/pg-core";

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    domain: varchar("domain", { length: 255 }).notNull().unique(),
    companyName: varchar("company_name", { length: 255 }),
    status: varchar("status", { length: 50 }).notNull().default("prospect"),
    renewalMonth: integer("renewal_month"),
    hasGroupHealthPlan: boolean("has_group_health_plan"),
    interestStatus: varchar("interest_status", { length: 50 }).default("unknown"),
    nextActionAt: timestamp("next_action_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    doNotContact: boolean("do_not_contact").notNull().default(false),
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_companies_status").on(table.status),
    index("idx_companies_renewal_month").on(table.renewalMonth),
    index("idx_companies_next_action").on(table.nextActionAt),
    index("idx_companies_last_activity").on(table.lastActivityAt),
  ]
);

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
