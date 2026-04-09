import { pgTable, uuid, varchar, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies";

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    title: varchar("title", { length: 255 }),
    email: varchar("email", { length: 255 }).notNull().unique(),
    phone: varchar("phone", { length: 50 }),
    status: varchar("status", { length: 50 }).notNull().default("active"),
    lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
    lastRepliedAt: timestamp("last_replied_at", { withTimezone: true }),
    doNotContact: boolean("do_not_contact").notNull().default(false),
    metadata: jsonb("metadata").$type<Record<string, string>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_contacts_company").on(table.companyId),
    index("idx_contacts_status").on(table.status),
  ]
);

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
