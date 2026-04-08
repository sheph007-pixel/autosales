import { NextResponse } from "next/server";
import { db, oauthAccounts } from "@autosales/db";
import { eq } from "drizzle-orm";

export async function POST() {
  try {
    const [account] = await db
      .select()
      .from(oauthAccounts)
      .where(eq(oauthAccounts.provider, "microsoft"))
      .limit(1);

    if (!account) {
      return NextResponse.json({ error: "No Outlook account connected" }, { status: 400 });
    }

    // In production, this would queue a pg-boss job.
    // For now, return success to indicate the trigger was received.
    // The worker service polls for sync jobs independently.
    return NextResponse.json({
      success: true,
      message: "Sync triggered. The worker will process it shortly.",
    });
  } catch (error) {
    console.error("Sync trigger error:", error);
    return NextResponse.json({ error: "Failed to trigger sync" }, { status: 500 });
  }
}
