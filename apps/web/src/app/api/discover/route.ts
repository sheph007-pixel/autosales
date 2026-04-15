import { NextResponse } from "next/server";
import { db, discoveredDomains, discoveredContacts, ensureTables } from "@autosales/db";
import { desc, eq, sql } from "drizzle-orm";
import { getScanState, getLiveResults, getLiveContacts, startFullScan } from "@/lib/discover";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = getScanState();

  // During active scanning, return live in-memory results
  if (state.status === "scanning") {
    return NextResponse.json({ ...state, domains: getLiveResults(), contacts: getLiveContacts() });
  }

  // For all other states (idle, cleaning, done, error): serve from DB
  try {
    await ensureTables();

    const domains = await db
      .select()
      .from(discoveredDomains)
      .orderBy(desc(discoveredDomains.totalCount));

    const contacts = await db
      .select({
        id: discoveredContacts.id,
        domainId: discoveredContacts.domainId,
        email: discoveredContacts.email,
        rawName: discoveredContacts.rawName,
        firstName: discoveredContacts.firstName,
        lastName: discoveredContacts.lastName,
        company: discoveredContacts.company,
        sentCount: discoveredContacts.sentCount,
        receivedCount: discoveredContacts.receivedCount,
        excluded: discoveredContacts.excluded,
        aiCleaned: discoveredContacts.aiCleaned,
        domain: discoveredDomains.domain,
      })
      .from(discoveredContacts)
      .innerJoin(discoveredDomains, eq(discoveredContacts.domainId, discoveredDomains.id))
      .orderBy(
        sql`COALESCE(${discoveredContacts.company}, '') ASC`,
        sql`COALESCE(${discoveredContacts.lastName}, '') ASC`
      );

    // Last scan time
    const lastScannedAt = state.lastScannedAt || null;

    return NextResponse.json({
      ...state,
      lastScannedAt,
      domains,
      contacts,
    });
  } catch (err) {
    console.error("[discover] GET error:", err);
    return NextResponse.json({
      ...state,
      domains: [],
      contacts: [],
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function POST() {
  const state = getScanState();
  if (state.status === "scanning" || state.status === "cleaning") {
    return NextResponse.json(state);
  }

  startFullScan().catch((err) => console.error("[discover] scan failed:", err));
  await new Promise((r) => setTimeout(r, 100));

  return NextResponse.json(getScanState());
}
