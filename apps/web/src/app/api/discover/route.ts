import { NextRequest, NextResponse } from "next/server";
import { db, discoveredDomains, discoveredContacts, ensureTables } from "@autosales/db";
import { desc, eq, sql } from "drizzle-orm";
import { getScanState, startScan } from "@/lib/discover";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = getScanState();

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

    return NextResponse.json({ ...state, domains, contacts });
  } catch (err) {
    return NextResponse.json({ ...state, domains: [], contacts: [], error: String(err) });
  }
}

export async function POST(request: NextRequest) {
  const state = getScanState();
  if (state.status === "scanning" || state.status === "cleaning") return NextResponse.json(state);

  const body = await request.json().catch(() => ({}));
  const forceFullScan = Boolean((body as Record<string, unknown>)?.forceFullScan);

  startScan(forceFullScan).catch((err) => console.error("[discover]", err));
  await new Promise((r) => setTimeout(r, 100));

  return NextResponse.json(getScanState());
}
