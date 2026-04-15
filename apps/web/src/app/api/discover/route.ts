import { NextResponse } from "next/server";
import { getScanState, getScanResults, startFullScan } from "@/lib/discover";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ...getScanState(),
    results: getScanResults(),
  });
}

export async function POST() {
  const state = getScanState();
  if (state.status === "scanning") {
    return NextResponse.json({ ...state, results: getScanResults() });
  }

  startFullScan().catch((err) => console.error("[discover] scan failed:", err));
  await new Promise((r) => setTimeout(r, 100));

  return NextResponse.json({ ...getScanState(), results: getScanResults() });
}
