import { NextRequest, NextResponse } from "next/server";
import { db, discoveredDomains, discoveredContacts, ensureTables } from "@autosales/db";
import { eq, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await ensureTables();

    const body = await request.json();
    const { type, excluded } = body as {
      type: "domain" | "contact";
      excluded: boolean;
      ids?: string[];
      domains?: string[];  // exclude by domain string (works during scanning)
      emails?: string[];   // exclude by email string (works during scanning)
    };

    if (type === "domain") {
      // By DB id
      const ids: string[] = body.ids ?? [];
      if (ids.length > 0) {
        await db.update(discoveredDomains)
          .set({ excluded, updatedAt: new Date() })
          .where(inArray(discoveredDomains.id, ids));
      }
      // By domain string (for items excluded during scan before they had IDs)
      const domains: string[] = body.domains ?? [];
      if (domains.length > 0) {
        await db.update(discoveredDomains)
          .set({ excluded, updatedAt: new Date() })
          .where(inArray(discoveredDomains.domain, domains));
      }
      if (ids.length === 0 && domains.length === 0) {
        return NextResponse.json({ error: "No ids or domains provided" }, { status: 400 });
      }
    } else if (type === "contact") {
      const ids: string[] = body.ids ?? [];
      if (ids.length > 0) {
        await db.update(discoveredContacts)
          .set({ excluded, updatedAt: new Date() })
          .where(inArray(discoveredContacts.id, ids));
      }
      const emails: string[] = body.emails ?? [];
      if (emails.length > 0) {
        await db.update(discoveredContacts)
          .set({ excluded, updatedAt: new Date() })
          .where(inArray(discoveredContacts.email, emails));
      }
      if (ids.length === 0 && emails.length === 0) {
        return NextResponse.json({ error: "No ids or emails provided" }, { status: 400 });
      }
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
