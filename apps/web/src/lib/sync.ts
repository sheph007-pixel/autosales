import { db, oauthAccounts, emailMessages, companies, contacts } from "@autosales/db";
import { eq, isNull, sql } from "drizzle-orm";
import { GraphClient, syncFolder, refreshAccessToken } from "@autosales/mail";
import type { ProcessedMessage } from "@autosales/mail";
import { extractDomain, isPersonalDomain, normalizeEmail, extractNameFromEmail } from "@autosales/core";

let _syncing = false;
let _lastSyncResult: SyncResult | null = null;

export interface SyncResult {
  at: string;
  fetched: number;
  stored: number;
  duplicates: number;
  matched: number;
  unmatched: number;
  error?: string;
}

export function getLastSyncResult(): SyncResult | null {
  return _lastSyncResult;
}

/**
 * Full mailbox sync: ingest everything, match after.
 * 1. Fetch all new messages from Outlook (inbox + sent)
 * 2. Store every message in Postgres (company_id = null if unknown)
 * 3. Run a matching pass to link unmatched messages to companies/contacts
 */
export async function runMailboxSync(): Promise<SyncResult> {
  if (_syncing) {
    return _lastSyncResult ?? { at: new Date().toISOString(), fetched: 0, stored: 0, duplicates: 0, matched: 0, unmatched: 0, error: "sync_in_progress" };
  }
  _syncing = true;

  const result: SyncResult = { at: new Date().toISOString(), fetched: 0, stored: 0, duplicates: 0, matched: 0, unmatched: 0 };

  try {
    const [account] = await db.select().from(oauthAccounts).where(eq(oauthAccounts.provider, "microsoft")).limit(1);
    if (!account?.refreshToken) {
      result.error = "no_account";
      _lastSyncResult = result;
      return result;
    }

    // Refresh token if needed
    let accessToken = account.accessToken!;
    if (account.tokenExpiresAt && account.tokenExpiresAt < new Date()) {
      console.log("[sync] refreshing expired token");
      const tokens = await refreshAccessToken(account.refreshToken);
      accessToken = tokens.access_token;
      await db.update(oauthAccounts).set({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? account.refreshToken,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        updatedAt: new Date(),
      }).where(eq(oauthAccounts.id, account.id));
    }

    const client = new GraphClient(accessToken);
    const userEmail = account.email!;

    const deltaTokens = account.deltaToken
      ? (JSON.parse(account.deltaToken as string) as { inbox?: string; sent?: string })
      : {};

    // --- Phase 1: Fetch & store all messages ---
    for (const folder of ["inbox", "sentitems"] as const) {
      const deltaKey = folder === "inbox" ? "inbox" : "sent";
      const { messages, deltaToken: newDelta } = await syncFolder(client, folder, userEmail, deltaTokens[deltaKey]);

      console.log(`[sync] ${folder}: ${messages.length} messages`);
      result.fetched += messages.length;

      for (const msg of messages) {
        try {
          // Check for duplicate
          if (msg.providerMessageId) {
            const [existing] = await db.select({ id: emailMessages.id })
              .from(emailMessages)
              .where(eq(emailMessages.providerMessageId, msg.providerMessageId))
              .limit(1);
            if (existing) { result.duplicates++; continue; }
          }

          // Store with nullable company_id/contact_id — match later
          await db.insert(emailMessages).values({
            providerMessageId: msg.providerMessageId,
            direction: msg.direction,
            fromAddress: msg.fromAddress,
            toAddresses: msg.toAddresses,
            subject: msg.subject,
            bodyText: msg.bodyText,
            bodyHtml: msg.bodyHtml,
            receivedAt: msg.receivedAt,
            companyId: null,
            contactId: null,
            threadId: null,
          });
          result.stored++;
        } catch (err) {
          // Unique constraint violation = duplicate
          const errMsg = err instanceof Error ? err.message : String(err);
          if (errMsg.includes("unique") || errMsg.includes("duplicate")) {
            result.duplicates++;
          } else {
            console.error("[sync] store error:", errMsg);
          }
        }
      }

      if (newDelta) deltaTokens[deltaKey] = newDelta;
    }

    // Save delta tokens + last sync time
    await db.update(oauthAccounts).set({
      deltaToken: JSON.stringify(deltaTokens),
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(oauthAccounts.id, account.id));

    // --- Phase 2: Match unlinked messages to companies/contacts ---
    const matchResult = await matchUnlinkedMessages(userEmail);
    result.matched = matchResult.matched;
    result.unmatched = matchResult.unmatched;

    console.log(`[sync] done: fetched=${result.fetched} stored=${result.stored} dupes=${result.duplicates} matched=${result.matched} unmatched=${result.unmatched}`);
    _lastSyncResult = result;
    return result;
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    console.error("[sync] failed:", result.error);
    _lastSyncResult = result;
    return result;
  } finally {
    _syncing = false;
  }
}

/**
 * Phase 2: find all email_messages with company_id IS NULL and try to match.
 * For each, extract the external email domain and look up the company.
 */
async function matchUnlinkedMessages(userEmail: string): Promise<{ matched: number; unmatched: number }> {
  let matched = 0;

  const unlinked = await db.select({
    id: emailMessages.id,
    direction: emailMessages.direction,
    fromAddress: emailMessages.fromAddress,
    toAddresses: emailMessages.toAddresses,
  })
    .from(emailMessages)
    .where(isNull(emailMessages.companyId))
    .limit(500);

  for (const msg of unlinked) {
    try {
      // Determine the external party's email
      const externalEmail = msg.direction === "inbound"
        ? msg.fromAddress
        : ((msg.toAddresses as string[])?.[0] ?? null);

      if (!externalEmail) continue;

      const domain = extractDomain(externalEmail);
      if (!domain || isPersonalDomain(domain)) continue;

      // Look up company by domain
      const [company] = await db.select({ id: companies.id })
        .from(companies)
        .where(eq(companies.domain, domain.toLowerCase()))
        .limit(1);

      if (!company) continue;

      // Find or create the contact
      const contactEmail = normalizeEmail(externalEmail);
      let contactId: string | null = null;
      const [existingContact] = await db.select({ id: contacts.id })
        .from(contacts)
        .where(eq(contacts.email, contactEmail))
        .limit(1);

      if (existingContact) {
        contactId = existingContact.id;
      } else {
        const [created] = await db.insert(contacts).values({
          companyId: company.id,
          email: contactEmail,
          name: extractNameFromEmail(contactEmail),
          status: "active",
        }).returning({ id: contacts.id });
        contactId = created?.id ?? null;
      }

      // Link the message
      await db.update(emailMessages).set({
        companyId: company.id,
        contactId,
      }).where(eq(emailMessages.id, msg.id));

      matched++;
    } catch (err) {
      // Skip individual match errors
    }
  }

  const [unmatchedCount] = await db.select({ count: sql<number>`count(*)` })
    .from(emailMessages)
    .where(isNull(emailMessages.companyId));

  return { matched, unmatched: Number(unmatchedCount?.count ?? 0) };
}
