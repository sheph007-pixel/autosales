import { NextRequest, NextResponse } from "next/server";
import { db, discoveredDomains, discoveredContacts, ensureTables } from "@autosales/db";
import { eq, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await ensureTables();

    const body = await request.json();
    const { type, excluded } = body as { type: "domain" | "contact"; excluded: boolean; id?: string; ids?: string[] };

    // Support single id or array of ids
    const ids: string[] = body.ids ?? (body.id ? [body.id] : []);
    if (ids.length === 0) {
      return NextResponse.json({ error: "No ids provided" }, { status: 400 });
    }

    if (type === "domain") {
      await db.update(discoveredDomains)
        .set({ excluded, updatedAt: new Date() })
        .where(inArray(discoveredDomains.id, ids));
    } else if (type === "contact") {
      await db.update(discoveredContacts)
        .set({ excluded, updatedAt: new Date() })
        .where(inArray(discoveredContacts.id, ids));
    } else {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, count: ids.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
