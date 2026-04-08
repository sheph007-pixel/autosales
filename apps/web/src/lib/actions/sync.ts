"use server";

import { db, oauthAccounts } from "@autosales/db";
import { eq } from "drizzle-orm";

export async function getOutlookConnectionStatus() {
  try {
    const [account] = await db
      .select()
      .from(oauthAccounts)
      .where(eq(oauthAccounts.provider, "microsoft"))
      .limit(1);

    if (!account) return { connected: false, email: null, lastSynced: null };

    const isExpired = account.tokenExpiresAt && account.tokenExpiresAt < new Date();

    return {
      connected: true,
      email: account.email,
      lastSynced: account.lastSyncedAt?.toISOString() ?? null,
      needsRefresh: isExpired,
    };
  } catch {
    return { connected: false, email: null, lastSynced: null };
  }
}
