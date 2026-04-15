import { NextResponse } from "next/server";
import { getScanState, getScanResults, startFullScan } from "@/lib/discover";

export const dynamic = "force-dynamic";

// GET: poll scan status + get results when done
export async function GET() {
  const state = getScanState();
  return NextResponse.json({
    ...state,
    results: state.status === "done" ? getScanResults() : [],
  });
}

// POST: start a scan (fire-and-forget, returns immediately)
export async function POST() {
  const state = getScanState();
  if (state.status === "scanning") {
    return NextResponse.json(state);
  }

  // Fire and forget — scan runs in background of Node process
  startFullScan().catch((err) => console.error("[discover] scan failed:", err));

  // Small delay so the state flips to "scanning" before we respond
  await new Promise((r) => setTimeout(r, 100));

  return NextResponse.json(getScanState());
}
