import { NextResponse } from "next/server";
import { db, oauthAccounts } from "@autosales/db";
import { eq } from "drizzle-orm";
import { runMailboxSync } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST() {
  try {
    const [account] = await db
      .select({
        id: oauthAccounts.id,
        email: oauthAccounts.email,
        lastSyncedAt: oauthAccounts.lastSyncedAt,
        hasRefreshToken: oauthAccounts.refreshToken,
        tokenExpiresAt: oauthAccounts.tokenExpiresAt,
      })
      .from(oauthAccounts)
      .where(eq(oauthAccounts.provider, "microsoft"))
      .limit(1);

    if (!account) {
      return NextResponse.json({ error: "No Outlook account connected. Go to Settings to connect." }, { status: 400 });
    }

    if (!account.hasRefreshToken) {
      return NextResponse.json({ error: `Account ${account.email} found but no refresh token. Re-connect Outlook in Settings.` }, { status: 400 });
    }

    console.log(`[sync-trigger] starting sync for ${account.email}, last synced: ${account.lastSyncedAt || "never"}`);

    const result = await runMailboxSync();

    console.log(`[sync-trigger] result:`, result);

    return NextResponse.json({
      success: !result.error,
      account: account.email,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Sync trigger error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return POST();
}
