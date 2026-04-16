import { NextResponse } from "next/server";
import { getScanState, runEnrichment } from "@/lib/discover";

export const dynamic = "force-dynamic";

export async function POST() {
  const state = getScanState();
  if (state.status === "scanning" || state.status === "cleaning" || state.status === "enriching") {
    return NextResponse.json(state);
  }

  // Fire-and-forget enrichment with proper status management
  runEnrichment().catch((err) => console.error("[discover] enrich failed:", err));
  await new Promise((r) => setTimeout(r, 100));

  return NextResponse.json(getScanState());
}
