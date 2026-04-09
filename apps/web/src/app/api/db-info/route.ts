import { NextResponse } from "next/server";
import { db } from "@autosales/db";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    const tables = await db.execute(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name
    `);

    const companyCols = await db.execute(sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'companies' ORDER BY ordinal_position
    `);

    const contactCols = await db.execute(sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'contacts' ORDER BY ordinal_position
    `);

    const companyCount = await db.execute(sql`SELECT count(*) as count FROM companies`);
    const contactCount = await db.execute(sql`SELECT count(*) as count FROM contacts`);

    return NextResponse.json({
      tables: tables,
      companies: { columns: companyCols, count: companyCount },
      contacts: { columns: contactCols, count: contactCount },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
