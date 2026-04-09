import { NextRequest, NextResponse } from "next/server";
import { db } from "@autosales/db";
import { sql } from "drizzle-orm";
import { isPersonalDomain, normalizeEmail, extractNameFromEmail } from "@autosales/core";
import { ensureTables } from "@autosales/db";

interface ImportPayload {
  headers: string[];
  rows: string[][];
  emailColumn: number;
}

function detectField(header: string): string | null {
  const h = header.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (h.includes("firstname") || h === "first") return "first_name";
  if (h.includes("lastname") || h === "last") return "last_name";
  if (h === "name" || h === "fullname" || h === "contactname") return "full_name";
  if (h.includes("title") || h.includes("jobtitle") || h === "position") return "title";
  if (h.includes("phone") || h.includes("mobile") || h.includes("cell")) return "phone";
  if (h === "company" || h === "companyname" || h === "organization" || h === "org" || h === "account") return "company_name";
  if (h === "domain" || h === "website" || h === "url") return "domain";
  return null;
}

async function ensureColumns() {
  const alters = [
    `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'`,
    `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active'`,
    `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone VARCHAR(50)`,
    `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS title VARCHAR(255)`,
    `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS do_not_contact BOOLEAN DEFAULT false`,
    `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ`,
    `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_replied_at TIMESTAMPTZ`,
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'prospect'`,
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS renewal_month INTEGER`,
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS has_group_health_plan BOOLEAN`,
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS interest_status VARCHAR(50) DEFAULT 'unknown'`,
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS do_not_contact BOOLEAN DEFAULT false`,
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS summary TEXT`,
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS next_action_at TIMESTAMPTZ`,
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ`,
  ];
  for (const a of alters) {
    try { await db.execute(sql.raw(a)); } catch {}
  }
}

async function getOrCreateCompany(domain: string, companyName: string | null, cache: Map<string, string>): Promise<string> {
  const cached = cache.get(domain);
  if (cached) return cached;

  // Try to find existing
  const found = await db.execute(sql`SELECT id FROM companies WHERE domain = ${domain} LIMIT 1`);
  const rows = found as unknown as Array<Record<string, unknown>>;

  if (rows.length > 0 && rows[0]?.id) {
    const id = String(rows[0].id);
    if (companyName) {
      try { await db.execute(sql`UPDATE companies SET company_name = COALESCE(company_name, ${companyName}), updated_at = now() WHERE id = ${id}::uuid`); } catch {}
    }
    cache.set(domain, id);
    return id;
  }

  // Create new
  const result = await db.execute(sql`
    INSERT INTO companies (domain, company_name, created_at, updated_at)
    VALUES (${domain}, ${companyName}, now(), now())
    ON CONFLICT (domain) DO UPDATE SET company_name = COALESCE(companies.company_name, EXCLUDED.company_name)
    RETURNING id
  `);
  const resultRows = result as unknown as Array<Record<string, unknown>>;
  const id = String(resultRows[0]?.id ?? "");

  if (!id) throw new Error(`Failed to create company for domain ${domain}`);

  cache.set(domain, id);
  return id;
}

export async function POST(request: NextRequest) {
  try {
    await ensureTables();
    await ensureColumns();

    const body = (await request.json()) as ImportPayload;
    const { headers, rows, emailColumn } = body;

    if (!rows?.length) return NextResponse.json({ success: false, message: "No rows." });
    if (emailColumn < 0) return NextResponse.json({ success: false, message: "Select email column." });

    let imported = 0;
    let companiesCreated = 0;
    const errors: string[] = [];
    const companyCache = new Map<string, string>();
    const initialCompanyCount = companyCache.size;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      try {
        const rawEmail = row[emailColumn]?.trim();
        if (!rawEmail || !rawEmail.includes("@")) {
          errors.push(`Row ${i + 2}: No valid email`);
          continue;
        }
        const email = normalizeEmail(rawEmail);

        // Gather all data
        const allData: Record<string, string> = {};
        let firstName = "", lastName = "", fullName = "", title = "", phone = "", companyName = "", domainVal = "";

        for (let c = 0; c < headers.length && c < row.length; c++) {
          if (c === emailColumn) continue;
          const val = row[c]?.trim() || "";
          if (!val) continue;
          allData[headers[c]!] = val;

          const field = detectField(headers[c]!);
          if (field === "first_name") firstName = val;
          else if (field === "last_name") lastName = val;
          else if (field === "full_name") fullName = val;
          else if (field === "title") title = val;
          else if (field === "phone") phone = val;
          else if (field === "company_name") companyName = val;
          else if (field === "domain") domainVal = val.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || "";
        }

        let name = fullName || (firstName || lastName ? `${firstName} ${lastName}`.trim() : "") || extractNameFromEmail(email);
        let domain = domainVal || email.split("@")[1] || "unknown.com";
        if (isPersonalDomain(domain)) domain = email.split("@")[1] || "unknown.com";

        const cacheSize = companyCache.size;
        const companyId = await getOrCreateCompany(domain, companyName || null, companyCache);
        if (companyCache.size > cacheSize) companiesCreated++;

        const metaJson = JSON.stringify(allData);

        // Upsert contact
        await db.execute(sql`
          INSERT INTO contacts (company_id, email, name, title, phone, metadata, created_at, updated_at)
          VALUES (${companyId}::uuid, ${email}, ${name}, ${title || null}, ${phone || null}, ${metaJson}::jsonb, now(), now())
          ON CONFLICT (email) DO UPDATE SET
            metadata = COALESCE(contacts.metadata, '{}'::jsonb) || ${metaJson}::jsonb,
            title = COALESCE(NULLIF(EXCLUDED.title, ''), contacts.title),
            phone = COALESCE(NULLIF(EXCLUDED.phone, ''), contacts.phone),
            name = CASE WHEN length(EXCLUDED.name) > length(contacts.name) THEN EXCLUDED.name ELSE contacts.name END,
            updated_at = now()
        `);
        imported++;
      } catch (err) {
        errors.push(`Row ${i + 2}: ${(err instanceof Error ? err.message : String(err)).slice(0, 80)}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Import complete.`,
      imported,
      companies: companiesCreated,
      totalRows: rows.length,
      errors: errors.slice(0, 50),
    });
  } catch (err) {
    return NextResponse.json({ success: false, message: err instanceof Error ? err.message : "Import failed" }, { status: 500 });
  }
}
