import { NextResponse } from "next/server";
import { db, oauthAccounts } from "@autosales/db";
import { eq } from "drizzle-orm";
import { runMailboxSync } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // allow up to 2 minutes for large syncs

export async function POST() {
  try {
    const [account] = await db
      .select({ id: oauthAccounts.id, lastSyncedAt: oauthAccounts.lastSyncedAt })
      .from(oauthAccounts)
      .where(eq(oauthAccounts.provider, "microsoft"))
      .limit(1);

    if (!account) {
      return NextResponse.json({ error: "No Outlook account connected" }, { status: 400 });
    }

    const result = await runMailboxSync();

    return NextResponse.json({
      success: !result.error,
      ...result,
    });
  } catch (error) {
    console.error("Sync trigger error:", error);
    return NextResponse.json({ error: "Failed to trigger sync" }, { status: 500 });
  }
}

// Also support GET for easy cron job triggering
export async function GET() {
  return POST();
}
