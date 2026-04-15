import { pgTable, uuid, varchar, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { discoveredDomains } from "./discovered-domains";

export const discoveredContacts = pgTable(
  "discovered_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    domainId: uuid("domain_id").notNull().references(() => discoveredDomains.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull().unique(),
    rawName: varchar("raw_name", { length: 255 }),
    firstName: varchar("first_name", { length: 255 }),
    lastName: varchar("last_name", { length: 255 }),
    company: varchar("company", { length: 255 }),
    sentCount: integer("sent_count").notNull().default(0),
    receivedCount: integer("received_count").notNull().default(0),
    excluded: boolean("excluded").notNull().default(false),
    aiCleaned: boolean("ai_cleaned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_disc_contacts_domain").on(table.domainId),
    index("idx_disc_contacts_excluded").on(table.excluded),
    index("idx_disc_contacts_ai").on(table.aiCleaned),
  ]
);

export type DiscoveredContact = typeof discoveredContacts.$inferSelect;
export type NewDiscoveredContact = typeof discoveredContacts.$inferInsert;
