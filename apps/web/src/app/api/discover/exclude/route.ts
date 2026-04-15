import { NextRequest, NextResponse } from "next/server";
import { db, discoveredDomains, discoveredContacts, ensureTables } from "@autosales/db";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await ensureTables();

    const body = await request.json();
    const { type, id, excluded } = body as { type: "domain" | "contact"; id: string; excluded: boolean };

    if (type === "domain") {
      await db.update(discoveredDomains)
        .set({ excluded, updatedAt: new Date() })
        .where(eq(discoveredDomains.id, id));
    } else if (type === "contact") {
      await db.update(discoveredContacts)
        .set({ excluded, updatedAt: new Date() })
        .where(eq(discoveredContacts.id, id));
    } else {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
