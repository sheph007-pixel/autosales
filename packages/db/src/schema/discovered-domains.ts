import { pgTable, uuid, varchar, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";

export const discoveredDomains = pgTable(
  "discovered_domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    domain: varchar("domain", { length: 255 }).notNull().unique(),
    sentCount: integer("sent_count").notNull().default(0),
    receivedCount: integer("received_count").notNull().default(0),
    totalCount: integer("total_count").notNull().default(0),
    excluded: boolean("excluded").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_disc_domains_total").on(table.totalCount),
    index("idx_disc_domains_excluded").on(table.excluded),
  ]
);

export type DiscoveredDomain = typeof discoveredDomains.$inferSelect;
export type NewDiscoveredDomain = typeof discoveredDomains.$inferInsert;
