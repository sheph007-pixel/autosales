import { NextResponse } from "next/server";
import { db } from "@autosales/db";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    // Fix names using first_name and last_name from metadata
    const result = await db.execute(sql`
      UPDATE contacts SET
        name = TRIM(
          COALESCE(metadata->>'first_name', '') || ' ' || COALESCE(metadata->>'last_name', '')
        ),
        title = COALESCE(NULLIF(metadata->>'title', ''), title),
        phone = COALESCE(NULLIF(metadata->>'primary_phone', ''), NULLIF(metadata->>'phone', ''), phone),
        updated_at = now()
      WHERE metadata IS NOT NULL
        AND (metadata->>'first_name' IS NOT NULL OR metadata->>'last_name' IS NOT NULL)
        AND TRIM(COALESCE(metadata->>'first_name', '') || ' ' || COALESCE(metadata->>'last_name', '')) != ''
    `);

    // Also update company names from contact metadata
    await db.execute(sql`
      UPDATE companies SET
        company_name = sub.company_name,
        updated_at = now()
      FROM (
        SELECT DISTINCT ON (company_id) company_id, metadata->>'company' as company_name
        FROM contacts
        WHERE metadata->>'company' IS NOT NULL AND metadata->>'company' != ''
      ) sub
      WHERE companies.id = sub.company_id AND companies.company_name IS NULL
    `);

    return NextResponse.json({ status: "ok", message: "Contact names and company names cleaned up" });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
