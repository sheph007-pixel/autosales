import { NextResponse } from "next/server";
import { ensureTables } from "@autosales/db";
import { runMailboxSync } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST() {
  try {
    await ensureTables();
    const result = await runMailboxSync();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function GET() {
  return POST();
}
