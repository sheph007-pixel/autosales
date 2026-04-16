import { NextRequest, NextResponse } from "next/server";
import { db, discoveredDomains, discoveredContacts, ensureTables } from "@autosales/db";
import { desc, eq, sql } from "drizzle-orm";
import { getScanState, getLiveResults, getLiveContacts, startScan } from "@/lib/discover";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = getScanState();

  // During scanning, return live in-memory results + saved counts
  if (state.status === "scanning") {
    return NextResponse.json({ ...state, domains: getLiveResults(), contacts: getLiveContacts() });
  }

  // Serve from DB
  try {
    await ensureTables();

    const domains = await db.select().from(discoveredDomains).orderBy(desc(discoveredDomains.totalCount));

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

    // Counts for status bar
    const domainCount = domains.filter((d) => !d.excluded).length;
    const contactCount = contacts.filter((c) => !c.excluded).length;
    const excludedDomainCount = domains.filter((d) => d.excluded).length;
    const excludedContactCount = contacts.filter((c) => c.excluded).length;

    return NextResponse.json({
      ...state,
      domainsSaved: domainCount,
      contactsSaved: contactCount,
      excludedDomainCount,
      excludedContactCount,
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

export async function POST(request: NextRequest) {
  const state = getScanState();
  if (state.status === "scanning" || state.status === "cleaning") {
    return NextResponse.json(state);
  }

  // Check for forceFullScan param
  const body = await request.json().catch(() => ({}));
  const forceFullScan = Boolean((body as Record<string, unknown>)?.forceFullScan);

  startScan(forceFullScan).catch((err) => console.error("[discover] scan failed:", err));
  await new Promise((r) => setTimeout(r, 100));

  return NextResponse.json(getScanState());
}
