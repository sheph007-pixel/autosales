import { pgTable, uuid, varchar, integer, timestamp, index } from "drizzle-orm/pg-core";
import { cadences } from "./cadences";
import { companies } from "./companies";
import { contacts } from "./contacts";

export const enrollments = pgTable(
  "enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cadenceId: uuid("cadence_id")
      .notNull()
      .references(() => cadences.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    currentStep: integer("current_step").notNull().default(1),
    status: varchar("status", { length: 50 }).notNull().default("active"),
    nextStepAt: timestamp("next_step_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_enrollments_cadence").on(table.cadenceId),
    index("idx_enrollments_company").on(table.companyId),
    index("idx_enrollments_contact").on(table.contactId),
    index("idx_enrollments_status").on(table.status),
    index("idx_enrollments_next_step").on(table.nextStepAt),
  ]
);

export type Enrollment = typeof enrollments.$inferSelect;
export type NewEnrollment = typeof enrollments.$inferInsert;
