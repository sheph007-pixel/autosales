import { NextResponse } from "next/server";
import { db, oauthAccounts, emailMessages } from "@autosales/db";
import { eq, isNull, sql } from "drizzle-orm";
import { getLastSyncResult } from "@/lib/sync";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Account status
    const [account] = await db.select({
      email: oauthAccounts.email,
      lastSyncedAt: oauthAccounts.lastSyncedAt,
      tokenExpiresAt: oauthAccounts.tokenExpiresAt,
      hasRefreshToken: sql<boolean>`refresh_token IS NOT NULL`,
    }).from(oauthAccounts).where(eq(oauthAccounts.provider, "microsoft")).limit(1);

    // Message counts
    const [counts] = await db.select({
      total: sql<number>`count(*)`,
      matched: sql<number>`count(*) FILTER (WHERE company_id IS NOT NULL)`,
      unmatched: sql<number>`count(*) FILTER (WHERE company_id IS NULL)`,
    }).from(emailMessages);

    const lastSync = getLastSyncResult();

    return NextResponse.json({
      connected: !!account,
      email: account?.email ?? null,
      lastSyncedAt: account?.lastSyncedAt?.toISOString() ?? null,
      tokenExpiresAt: account?.tokenExpiresAt?.toISOString() ?? null,
      hasRefreshToken: !!account?.hasRefreshToken,
      messages: {
        total: Number(counts?.total ?? 0),
        matched: Number(counts?.matched ?? 0),
        unmatched: Number(counts?.unmatched ?? 0),
      },
      lastSyncResult: lastSync,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
