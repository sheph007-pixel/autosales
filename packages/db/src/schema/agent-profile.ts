import { pgTable, boolean, text, timestamp } from "drizzle-orm/pg-core";

// Single-row table. The singleton PK guarantees only one row exists.
export const agentProfile = pgTable("agent_profile", {
  singleton: boolean("singleton").primaryKey().default(true),
  name: text("name").notNull().default("Hunter Shepherd"),
  company: text("company").notNull().default("Kennion"),
  identity: text("identity"),
  targetDescription: text("target_description"),
  offerDescription: text("offer_description"),
  goals: text("goals"),
  toneRules: text("tone_rules"),
  systemInstructions: text("system_instructions"),
  guardrails: text("guardrails"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AgentProfile = typeof agentProfile.$inferSelect;
export type NewAgentProfile = typeof agentProfile.$inferInsert;
