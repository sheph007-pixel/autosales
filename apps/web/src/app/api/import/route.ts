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

async function getOrCreateCompany(domain: string, companyName: string | null, cache: Map<string, string>): Promise<string> {
  const cached = cache.get(domain);
  if (cached) return cached;

  const found = await db.execute(sql`SELECT id FROM companies WHERE domain = ${domain} LIMIT 1`);
  const rows = found as unknown as Array<Record<string, unknown>>;
  if (rows.length > 0 && rows[0]?.id) {
    const id = String(rows[0].id);
    cache.set(domain, id);
    return id;
  }

  await db.execute(sql`
    INSERT INTO companies (domain, company_name, created_at, updated_at)
    VALUES (${domain}, ${companyName}, now(), now())
  `);

  const refetch = await db.execute(sql`SELECT id FROM companies WHERE domain = ${domain} LIMIT 1`);
  const refetchRows = refetch as unknown as Array<Record<string, unknown>>;
  const id = String(refetchRows[0]?.id ?? "");
  if (!id) throw new Error(`Could not create company for ${domain}`);

  cache.set(domain, id);
  return id;
}

export async function POST(request: NextRequest) {
  try {
    await ensureTables();

    const body = (await request.json()) as ImportPayload;
    const { headers, rows, emailColumn } = body;

    if (!rows?.length) return NextResponse.json({ success: false, message: "No rows." });
    if (emailColumn < 0) return NextResponse.json({ success: false, message: "Select email column." });

    let imported = 0;
    let skipped = 0;
    let companiesCreated = 0;
    const errors: string[] = [];
    const companyCache = new Map<string, string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      try {
        const rawEmail = row[emailColumn]?.trim();
        if (!rawEmail || !rawEmail.includes("@")) {
          errors.push(`Row ${i + 2}: No valid email`);
          continue;
        }
        const email = normalizeEmail(rawEmail);

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
        if (isPersonalDomain(domain)) {
          skipped++;
          errors.push(`Row ${i + 2}: Skipped personal email (${domain})`);
          continue;
        }

        const prevSize = companyCache.size;
        const companyId = await getOrCreateCompany(domain, companyName || null, companyCache);
        if (companyCache.size > prevSize) companiesCreated++;

        const metaJson = JSON.stringify(allData);

        // Check if contact exists
        const existing = await db.execute(sql`SELECT id FROM contacts WHERE email = ${email} LIMIT 1`);
        const existingRows = existing as unknown as Array<Record<string, unknown>>;

        if (existingRows.length > 0 && existingRows[0]?.id) {
          await db.execute(sql`
            UPDATE contacts SET
              metadata = COALESCE(metadata, '{}'::jsonb) || ${metaJson}::jsonb,
              title = COALESCE(NULLIF(${title}, ''), title),
              phone = COALESCE(NULLIF(${phone}, ''), phone),
              updated_at = now()
            WHERE email = ${email}
          `);
        } else {
          const inserted = await db.execute(sql`
            INSERT INTO contacts (company_id, email, name, title, phone, metadata, created_at, updated_at)
            VALUES (${companyId}::uuid, ${email}, ${name}, ${title || null}, ${phone || null}, ${metaJson}::jsonb, now(), now())
            RETURNING id
          `);
          const insertedRows = inserted as unknown as Array<{ id: string }>;
          const newContactId = insertedRows[0]?.id;
          if (newContactId) {
            // Set as primary contact if group doesn't have one yet
            await db.execute(sql`
              UPDATE companies SET primary_contact_id = ${newContactId}::uuid
              WHERE id = ${companyId}::uuid AND primary_contact_id IS NULL
            `);
          }
        }
        imported++;
      } catch (err) {
        errors.push(`Row ${i + 2}: ${(err instanceof Error ? err.message : String(err)).slice(0, 80)}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Import complete.`,
      imported,
      skipped,
      companies: companiesCreated,
      totalRows: rows.length,
      errors: errors.slice(0, 50),
    });
  } catch (err) {
    return NextResponse.json({ success: false, message: err instanceof Error ? err.message : "Import failed" }, { status: 500 });
  }
}
