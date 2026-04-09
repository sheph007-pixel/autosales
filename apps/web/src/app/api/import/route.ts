import { NextRequest, NextResponse } from "next/server";
import { db, companies, contacts } from "@autosales/db";
import { eq } from "drizzle-orm";
import { extractBusinessDomain, normalizeEmail, extractNameFromEmail, isPersonalDomain } from "@autosales/core";

interface ImportPayload {
  headers: string[];
  rows: string[][];
  mapping: Record<string, string>;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ImportPayload;
    const { rows, mapping } = body;

    if (!rows || rows.length === 0) {
      return NextResponse.json({ success: false, message: "No rows to import." });
    }

    // Build reverse mapping: field -> column index
    const fieldToCol: Record<string, number> = {};
    for (const [colIdx, field] of Object.entries(mapping)) {
      if (field !== "skip") {
        fieldToCol[field] = parseInt(colIdx);
      }
    }

    if (fieldToCol.email === undefined) {
      return NextResponse.json({ success: false, message: "Email field must be mapped." });
    }

    let importedContacts = 0;
    let createdCompanies = 0;
    const errors: string[] = [];
    const companyCache = new Map<string, string>(); // domain -> company id

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      try {
        const email = row[fieldToCol.email!]?.trim().toLowerCase();
        if (!email || !email.includes("@")) {
          errors.push(`Row ${i + 1}: Invalid or missing email`);
          continue;
        }

        // Build name
        let name = "";
        if (fieldToCol.name !== undefined) {
          name = row[fieldToCol.name]?.trim() || "";
        }
        if (!name && (fieldToCol.first_name !== undefined || fieldToCol.last_name !== undefined)) {
          const first = fieldToCol.first_name !== undefined ? row[fieldToCol.first_name]?.trim() || "" : "";
          const last = fieldToCol.last_name !== undefined ? row[fieldToCol.last_name]?.trim() || "" : "";
          name = `${first} ${last}`.trim();
        }
        if (!name) {
          name = extractNameFromEmail(email);
        }

        // Get domain
        let domain = "";
        if (fieldToCol.domain !== undefined) {
          domain = row[fieldToCol.domain]?.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || "";
        }
        if (!domain) {
          domain = email.split("@")[1] || "";
        }

        if (!domain || isPersonalDomain(domain)) {
          // Still import but use email domain
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
            // Update company name if provided and not set
            const companyName = fieldToCol.company_name !== undefined ? row[fieldToCol.company_name]?.trim() : undefined;
            if (companyName && !existing.companyName) {
              await db.update(companies).set({ companyName, updatedAt: new Date() }).where(eq(companies.id, existing.id));
            }
          } else {
            const companyName = fieldToCol.company_name !== undefined ? row[fieldToCol.company_name]?.trim() || null : null;
            const renewalMonth = fieldToCol.renewal_month !== undefined ? parseInt(row[fieldToCol.renewal_month]?.trim() || "") || null : null;
            const hasPlan = fieldToCol.has_plan !== undefined ? ["true", "yes", "1", "y"].includes(row[fieldToCol.has_plan]?.trim().toLowerCase() || "") : null;

            const companyData: Record<string, unknown> = {
              domain,
              companyName,
              status: "prospect",
              interestStatus: "unknown",
            };
            if (renewalMonth && renewalMonth >= 1 && renewalMonth <= 12) {
              companyData.renewalMonth = renewalMonth;
            }
            if (hasPlan !== null) {
              companyData.hasGroupHealthPlan = hasPlan;
            }

            const [created] = await db.insert(companies).values(companyData as any).returning();
            companyId = created!.id;
            createdCompanies++;
          }
          companyCache.set(domain, companyId);
        }

        // Check if contact exists
        const [existingContact] = await db
          .select()
          .from(contacts)
          .where(eq(contacts.email, normalizeEmail(email)))
          .limit(1);

        if (existingContact) {
          // Update if we have new info
          const updates: Record<string, unknown> = {};
          const title = fieldToCol.title !== undefined ? row[fieldToCol.title]?.trim() : undefined;
          const phone = fieldToCol.phone !== undefined ? row[fieldToCol.phone]?.trim() : undefined;
          if (title && !existingContact.title) updates.title = title;
          if (phone && !existingContact.phone) updates.phone = phone;
          if (name && existingContact.name === extractNameFromEmail(email)) updates.name = name;

          if (Object.keys(updates).length > 0) {
            updates.updatedAt = new Date();
            await db.update(contacts).set(updates).where(eq(contacts.id, existingContact.id));
          }
          importedContacts++;
          continue;
        }

        // Create contact
        const contactData: Record<string, unknown> = {
          companyId,
          email: normalizeEmail(email),
          name,
          status: "active",
        };

        const title = fieldToCol.title !== undefined ? row[fieldToCol.title]?.trim() || null : null;
        const phone = fieldToCol.phone !== undefined ? row[fieldToCol.phone]?.trim() || null : null;
        if (title) contactData.title = title;
        if (phone) contactData.phone = phone;

        await db.insert(contacts).values(contactData as any);
        importedContacts++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Row ${i + 1}: ${msg}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Import complete.`,
      imported: importedContacts,
      companies: createdCompanies,
      totalRows: rows.length,
      errors: errors.slice(0, 20),
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      message: err instanceof Error ? err.message : "Import failed",
    }, { status: 500 });
  }
}
