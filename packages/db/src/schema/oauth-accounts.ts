import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";

export const oauthAccounts = pgTable("oauth_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: varchar("provider", { length: 50 }).notNull(),
  providerAccountId: varchar("provider_account_id", { length: 255 }),
  accessToken: text("access_token"), // TODO: encrypt at rest
  refreshToken: text("refresh_token"), // TODO: encrypt at rest
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  email: varchar("email", { length: 255 }),
  deltaToken: text("delta_token"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OAuthAccount = typeof oauthAccounts.$inferSelect;
export type NewOAuthAccount = typeof oauthAccounts.$inferInsert;
