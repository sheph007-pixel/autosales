import { NextResponse } from "next/server";
import { db, discoveredDomains, discoveredContacts, ensureTables } from "@autosales/db";
import { desc, eq, sql } from "drizzle-orm";
import { getScanState, getLiveResults, startFullScan } from "@/lib/discover";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = getScanState();

  // During scan, return live in-memory results
  if (state.status === "scanning") {
    return NextResponse.json({ ...state, domains: getLiveResults(), contacts: [] });
  }

  // Otherwise serve from DB
  try {
    await ensureTables();

    const domains = await db.select().from(discoveredDomains).orderBy(desc(discoveredDomains.totalCount));

    const contacts = await db.select({
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
      .orderBy(discoveredContacts.company, discoveredContacts.lastName);

    // Get last scan time from most recent domain update
    const [latest] = await db.select({ t: sql<string>`MAX(updated_at)` }).from(discoveredDomains);
    const lastScannedAt = state.lastScannedAt || (latest?.t ? new Date(latest.t).toISOString() : null);

    return NextResponse.json({
      ...state,
      lastScannedAt,
      domains,
      contacts,
    });
  } catch (err) {
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
