import { NextResponse } from "next/server";
import { db, oauthAccounts } from "@autosales/db";
import { sql } from "drizzle-orm";

export async function GET() {
  const version = process.env.BUILD_VERSION || "dev";
  const buildTime = process.env.BUILD_TIME || "unknown";

  let dbStatus = "unknown";
  let tablesExist = false;

  try {
    // Test basic DB connection
    await db.execute(sql`SELECT 1`);
    dbStatus = "connected";

    // Check if our tables exist
    const result = await db.execute(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
    );
    const tables = (result as unknown as Array<{ table_name: string }>).map(
      (r) => r.table_name
    );
    tablesExist = tables.includes("oauth_accounts");

    return NextResponse.json({
      status: "ok",
      version,
      buildTime,
      db: dbStatus,
      tablesExist,
      tableCount: tables.length,
      tables,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    dbStatus = err instanceof Error ? err.message : "error";
    return NextResponse.json({
      status: "degraded",
      version,
      buildTime,
      db: dbStatus,
      tablesExist,
      timestamp: new Date().toISOString(),
    });
  }
}
