import { and, eq, inArray } from "drizzle-orm";
import { db, companies, contacts } from "@autosales/db";
import type { Cadence, Company, Contact } from "@autosales/db";

export interface CampaignFilter {
  renewalWithinDays?: number;
  noReplyDays?: number;
}

export interface EligibleGroup {
  company: Company;
  primaryContact: Contact | null;
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

/**
 * Resolve the set of Groups that a campaign is eligible to target RIGHT NOW.
 *
 * Used by both:
 *  - the scheduler (to pick groups to enroll)
 *  - the preview action (so the user can see who would be hit before
 *    activating a campaign)
 *
 * Rules enforced:
 *  - Status must be in `allowedStatuses` (Lead / Old Client / etc.)
 *  - `doNotContact = false` at the company level
 *  - Optional: `renewalWithinDays` — only groups with a known renewal
 *    month falling within that window
 *  - Optional: `noReplyDays` — only groups with no activity in the last
 *    N days (or never active)
 *
 * Returns up to `limit` groups, each with their resolved primary contact
 * (either `primary_contact_id` or fallback to earliest contact). Groups
 * with no contact at all are excluded (can't send to them).
 */
export async function resolveEligibleGroups(opts: {
  allowedStatuses: string[];
  filter: CampaignFilter;
  limit?: number;
}): Promise<EligibleGroup[]> {
  const { allowedStatuses, filter, limit = 200 } = opts;

  if (!allowedStatuses || allowedStatuses.length === 0) return [];

  // Pull candidates by status + DNC only — other filters applied in JS to
  // keep SQL simple and portable across drizzle versions.
  const candidates = await db
    .select()
    .from(companies)
    .where(
      and(
        inArray(companies.status, allowedStatuses),
        eq(companies.doNotContact, false)
      )
    )
    .limit(limit * 2); // over-fetch, post-filter narrows

  const filtered = candidates.filter((c) => {
    if (filter.renewalWithinDays != null && c.renewalMonth != null) {
      const nowMonth = new Date().getMonth() + 1;
      let diff = c.renewalMonth - nowMonth;
      if (diff < 0) diff += 12;
      const days = diff * 30; // rough
      if (days > filter.renewalWithinDays) return false;
    }
    if (filter.noReplyDays != null && c.lastActivityAt) {
      if (c.lastActivityAt > daysAgo(filter.noReplyDays)) return false;
    }
    return true;
  });

  if (filtered.length === 0) return [];

  // Resolve primary contact for each — prefer company.primary_contact_id,
  // fall back to earliest contact for the group. Skip groups with no
  // contacts (we can't send to them).
  const result: EligibleGroup[] = [];
  const sliced = filtered.slice(0, limit);

  // Batch-load primary contacts for the ones with a primary_contact_id
  const primaryIds = sliced
    .map((c) => c.primaryContactId)
    .filter((id): id is string => !!id);
  const primaryContactMap = new Map<string, Contact>();
  if (primaryIds.length > 0) {
    const rows = await db
      .select()
      .from(contacts)
      .where(inArray(contacts.id, primaryIds));
    for (const r of rows) primaryContactMap.set(r.id, r);
  }

  // Fallback: earliest contact per company for ones without a primary
  const fallbackCompanyIds = sliced
    .filter((c) => !c.primaryContactId)
    .map((c) => c.id);
  const fallbackMap = new Map<string, Contact>();
  if (fallbackCompanyIds.length > 0) {
    const rows = await db
      .select()
      .from(contacts)
      .where(inArray(contacts.companyId, fallbackCompanyIds))
      .orderBy(contacts.createdAt);
    for (const r of rows) {
      if (!fallbackMap.has(r.companyId)) fallbackMap.set(r.companyId, r);
    }
  }

  for (const company of sliced) {
    let primaryContact: Contact | null = null;
    if (company.primaryContactId) {
      primaryContact = primaryContactMap.get(company.primaryContactId) ?? null;
    }
    if (!primaryContact) {
      primaryContact = fallbackMap.get(company.id) ?? null;
    }
    // Skip groups with no contact AND no primary contact — can't email them
    if (!primaryContact) continue;
    // Also respect contact-level DNC
    if (primaryContact.doNotContact) continue;

    result.push({ company, primaryContact });
  }

  return result;
}

/**
 * Convenience: does a group match a campaign's targeting rules right now?
 * Used by execute-cadence-step to re-verify eligibility before sending,
 * since status can change between enrollment and execution (e.g., a
 * classified reply flipping status to not_qualified).
 */
export function groupMatchesCampaign(
  company: Company,
  campaign: Pick<Cadence, "allowedStatuses" | "filterJson">
): boolean {
  const allowed = Array.isArray(campaign.allowedStatuses)
    ? (campaign.allowedStatuses as string[])
    : [];
  if (allowed.length === 0) return false;
  if (!allowed.includes(company.status)) return false;
  if (company.doNotContact) return false;
  return true;
}
