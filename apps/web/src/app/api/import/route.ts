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
  if (h.includes("title") || h.includes("jobtitle") || h === "position" || h === "role") return "title";
  if (h.includes("phone") || h.includes("mobile") || h.includes("cell") || h.includes("tel")) return "phone";
  if (h === "company" || h === "companyname" || h === "organization" || h === "org" || h === "account") return "company_name";
  if (h === "domain" || h === "website" || h === "url") return "domain";
  if (h.includes("renewal")) return "renewal_month";
  return null;
}

export async function POST(request: NextRequest) {
  try {
    await ensureTables();
    await db.execute(sql`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'`);
    await db.execute(sql`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'active'`);
    await db.execute(sql`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone VARCHAR(50)`);
    await db.execute(sql`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS title VARCHAR(255)`);
    await db.execute(sql`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS do_not_contact BOOLEAN NOT NULL DEFAULT false`);
    await db.execute(sql`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ`);
    await db.execute(sql`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_replied_at TIMESTAMPTZ`);
    await db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS renewal_month INTEGER`);
    await db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS has_group_health_plan BOOLEAN`);
    await db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS interest_status VARCHAR(50) DEFAULT 'unknown'`);
    await db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS do_not_contact BOOLEAN NOT NULL DEFAULT false`);
    await db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS summary TEXT`);
    await db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS next_action_at TIMESTAMPTZ`);
    await db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ`);
    await db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'prospect'`);

    const body = (await request.json()) as ImportPayload;
    const { headers, rows, emailColumn } = body;

    if (!rows || rows.length === 0) {
      return NextResponse.json({ success: false, message: "No rows to import." });
    }
    if (emailColumn < 0 || emailColumn >= headers.length) {
      return NextResponse.json({ success: false, message: "Invalid email column." });
    }

    let importedContacts = 0;
    let createdCompanies = 0;
    const errors: string[] = [];
    const companyCache = new Map<string, string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      try {
        const email = row[emailColumn]?.trim().toLowerCase();
        if (!email || !email.includes("@")) {
          errors.push(`Row ${i + 2}: Invalid email`);
          continue;
        }

        // Collect ALL data from every column
        const allData: Record<string, string> = {};
        let detectedName = "";
        let detectedFirstName = "";
        let detectedLastName = "";
        let detectedTitle = "";
        let detectedPhone = "";
        let detectedCompany = "";
        let detectedDomain = "";
        let detectedRenewal: number | null = null;

        for (let c = 0; c < headers.length; c++) {
          if (c === emailColumn) continue;
          const value = row[c]?.trim() || "";
          if (!value) continue;

          allData[headers[c]!] = value;

          const field = detectField(headers[c]!);
          switch (field) {
            case "full_name": detectedName = value; break;
            case "first_name": detectedFirstName = value; break;
            case "last_name": detectedLastName = value; break;
            case "title": detectedTitle = value; break;
            case "phone": detectedPhone = value; break;
            case "company_name": detectedCompany = value; break;
            case "domain":
              detectedDomain = value.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || "";
              break;
            case "renewal_month": {
              const num = parseInt(value);
              if (num >= 1 && num <= 12) detectedRenewal = num;
              break;
            }
          }
        }

        let name = detectedName;
        if (!name && (detectedFirstName || detectedLastName)) {
          name = `${detectedFirstName} ${detectedLastName}`.trim();
        }
        if (!name) name = extractNameFromEmail(email);

        let domain = detectedDomain || email.split("@")[1] || "unknown.com";
        if (isPersonalDomain(domain)) {
          domain = email.split("@")[1] || "unknown.com";
        }

        // Get or create company
        let companyId = companyCache.get(domain);
        if (!companyId) {
          const companyRows = await db.execute(sql`SELECT id, company_name, renewal_month FROM companies WHERE domain = ${domain} LIMIT 1`);
          const existing = (companyRows as unknown as Array<{id: string; company_name: string | null; renewal_month: number | null}>)[0];

          if (existing) {
            companyId = existing.id;
            if (detectedCompany && !existing.company_name) {
              await db.execute(sql`UPDATE companies SET company_name = ${detectedCompany}, updated_at = now() WHERE id = ${existing.id}::uuid`);
            }
            if (detectedRenewal && !existing.renewal_month) {
              await db.execute(sql`UPDATE companies SET renewal_month = ${detectedRenewal}, updated_at = now() WHERE id = ${existing.id}::uuid`);
            }
          } else {
            const created = await db.execute(sql`
              INSERT INTO companies (domain, company_name, status, interest_status, renewal_month, created_at, updated_at)
              VALUES (${domain}, ${detectedCompany || null}, 'prospect', 'unknown', ${detectedRenewal}, now(), now())
              RETURNING id
            `);
            const createdRow = (created as unknown as Array<{id: string}>)[0];
            companyId = createdRow!.id;
            createdCompanies++;
          }
          companyCache.set(domain, companyId);
        }

        // Use raw SQL for contact insert/update to avoid ORM column conflicts
        const normalizedEmail = normalizeEmail(email);
        const metadataJson = JSON.stringify(allData);

        const existingRows = await db.execute(sql`SELECT id, name, metadata FROM contacts WHERE email = ${normalizedEmail} LIMIT 1`);
        const existingContact = (existingRows as unknown as Array<{id: string; name: string; metadata: Record<string, string> | null}>)[0];

        if (existingContact) {
          const existingMeta = existingContact.metadata || {};
          const merged = { ...existingMeta, ...allData };
          await db.execute(sql`
            UPDATE contacts SET
              metadata = ${JSON.stringify(merged)}::jsonb,
              title = COALESCE(NULLIF(${detectedTitle}, ''), title),
              phone = COALESCE(NULLIF(${detectedPhone}, ''), phone),
              name = CASE WHEN name = ${extractNameFromEmail(email)} AND ${name} != '' THEN ${name} ELSE name END,
              updated_at = now()
            WHERE id = ${existingContact.id}::uuid
          `);
          importedContacts++;
        } else {
          await db.execute(sql`
            INSERT INTO contacts (company_id, email, name, title, phone, status, metadata, created_at, updated_at)
            VALUES (
              ${companyId}::uuid,
              ${normalizedEmail},
              ${name},
              ${detectedTitle || null},
              ${detectedPhone || null},
              'active',
              ${metadataJson}::jsonb,
              now(),
              now()
            )
          `);
          importedContacts++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Row ${i + 2}: ${msg.slice(0, 80)}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Import complete.`,
      imported: importedContacts,
      companies: createdCompanies,
      totalRows: rows.length,
      skipped: rows.length - importedContacts,
      errors: errors.slice(0, 50),
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      message: err instanceof Error ? err.message : "Import failed",
    }, { status: 500 });
  }
}
