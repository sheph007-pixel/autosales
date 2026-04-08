import { pgTable, uuid, varchar, text, boolean, timestamp, integer, index } from "drizzle-orm/pg-core";

export const cadences = pgTable("cadences", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  triggerType: varchar("trigger_type", { length: 50 }).notNull().default("manual"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cadenceSteps = pgTable(
  "cadence_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cadenceId: uuid("cadence_id")
      .notNull()
      .references(() => cadences.id, { onDelete: "cascade" }),
    stepNumber: integer("step_number").notNull(),
    delayDays: integer("delay_days").notNull().default(0),
    actionType: varchar("action_type", { length: 50 }).notNull().default("send_email"),
    templatePrompt: text("template_prompt"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_cadence_steps_cadence").on(table.cadenceId)]
);

export type Cadence = typeof cadences.$inferSelect;
export type NewCadence = typeof cadences.$inferInsert;
export type CadenceStep = typeof cadenceSteps.$inferSelect;
export type NewCadenceStep = typeof cadenceSteps.$inferInsert;
