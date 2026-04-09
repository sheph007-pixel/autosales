import { NextRequest, NextResponse } from "next/server";
import { db, companies, contacts } from "@autosales/db";
import { eq, sql } from "drizzle-orm";
import { isPersonalDomain, normalizeEmail, extractNameFromEmail } from "@autosales/core";
import { ensureTables } from "@autosales/db";

interface ImportPayload {
  headers: string[];
  rows: string[][];
  emailColumn: number;
}

// Smart field detection from header names
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

    // Add metadata column if it doesn't exist yet
    await db.execute(sql`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'`);

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
          errors.push(`Row ${i + 2}: Invalid or missing email "${row[emailColumn]}"`);
          continue;
        }

        // Build metadata from ALL columns using original header names
        const metadata: Record<string, string> = {};
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

          // Store EVERYTHING in metadata with original header name
          metadata[headers[c]!] = value;

          // Also detect known fields for structured storage
          const field = detectField(headers[c]!);
          switch (field) {
            case "full_name": detectedName = value; break;
            case "first_name": detectedFirstName = value; break;
            case "last_name": detectedLastName = value; break;
            case "title": detectedTitle = value; break;
            case "phone": detectedPhone = value; break;
            case "company_name": detectedCompany = value; break;
            case "domain": detectedDomain = value.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || ""; break;
            case "renewal_month": {
              const num = parseInt(value);
              if (num >= 1 && num <= 12) detectedRenewal = num;
              break;
            }
          }
        }

        // Resolve name
        let name = detectedName;
        if (!name && (detectedFirstName || detectedLastName)) {
          name = `${detectedFirstName} ${detectedLastName}`.trim();
        }
        if (!name) name = extractNameFromEmail(email);

        // Resolve domain
        let domain = detectedDomain || email.split("@")[1] || "unknown.com";
        if (isPersonalDomain(domain)) {
          domain = email.split("@")[1] || "unknown.com";
        }

        // Get or create company
        let companyId = companyCache.get(domain);
        if (!companyId) {
          const [existing] = await db
            .select()
            .from(companies)
            .where(eq(companies.domain, domain))
            .limit(1);

          if (existing) {
            companyId = existing.id;
            if (detectedCompany && !existing.companyName) {
              await db.update(companies).set({ companyName: detectedCompany, updatedAt: new Date() }).where(eq(companies.id, existing.id));
            }
            if (detectedRenewal && !existing.renewalMonth) {
              await db.update(companies).set({ renewalMonth: detectedRenewal, updatedAt: new Date() }).where(eq(companies.id, existing.id));
            }
          } else {
            const [created] = await db
              .insert(companies)
              .values({
                domain,
                companyName: detectedCompany || null,
                status: "prospect",
                interestStatus: "unknown",
                renewalMonth: detectedRenewal,
              })
              .returning();
            companyId = created!.id;
            createdCompanies++;
          }
          companyCache.set(domain, companyId);
        }

        // Check for existing contact
        const [existing] = await db
          .select()
          .from(contacts)
          .where(eq(contacts.email, normalizeEmail(email)))
          .limit(1);

        if (existing) {
          // Merge metadata
          const existingMeta = (existing.metadata as Record<string, string>) || {};
          const mergedMeta = { ...existingMeta, ...metadata };
          const updates: Record<string, unknown> = { metadata: mergedMeta, updatedAt: new Date() };
          if (detectedTitle && !existing.title) updates.title = detectedTitle;
          if (detectedPhone && !existing.phone) updates.phone = detectedPhone;
          if (name && existing.name === extractNameFromEmail(email)) updates.name = name;
          await db.update(contacts).set(updates).where(eq(contacts.id, existing.id));
          importedContacts++;
        } else {
          await db.insert(contacts).values({
            companyId,
            email: normalizeEmail(email),
            name,
            title: detectedTitle || null,
            phone: detectedPhone || null,
            status: "active",
            metadata,
          });
          importedContacts++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Row ${i + 2}: ${msg.slice(0, 100)}`);
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
      fieldsStored: headers,
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      message: err instanceof Error ? err.message : "Import failed",
    }, { status: 500 });
  }
}
