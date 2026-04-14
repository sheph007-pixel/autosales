import { db, oauthAccounts, emailMessages, companies } from "@autosales/db";
import { eq } from "drizzle-orm";
import { GraphClient, syncFolder, refreshAccessToken } from "@autosales/mail";
import type { ProcessedMessage } from "@autosales/mail";
import { touchCompanyActivity } from "@autosales/core/services/company.service";
import { findOrCreateContact, markContacted, markReplied } from "@autosales/core/services/contact.service";
import { findOrCreateThread, upsertMessage } from "@autosales/core/services/thread.service";
import { extractBusinessDomain } from "@autosales/core";

let _syncing = false;

/**
 * Run a full mailbox sync inline (no worker/pg-boss required).
 * Only processes emails for companies that already exist in the database.
 * Safe to call frequently — skips if a sync is already in progress.
 */
export async function runMailboxSync(): Promise<{
  processed: number;
  skippedUnknown: number;
  error?: string;
}> {
  if (_syncing) return { processed: 0, skippedUnknown: 0, error: "sync_in_progress" };
  _syncing = true;

  try {
    const [account] = await db
      .select()
      .from(oauthAccounts)
      .where(eq(oauthAccounts.provider, "microsoft"))
      .limit(1);

    if (!account || !account.refreshToken) {
      return { processed: 0, skippedUnknown: 0, error: "no_account" };
    }

    // Refresh token if expired
    let accessToken = account.accessToken!;
    if (account.tokenExpiresAt && account.tokenExpiresAt < new Date()) {
      const tokens = await refreshAccessToken(account.refreshToken);
      accessToken = tokens.access_token;
      await db
        .update(oauthAccounts)
        .set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          updatedAt: new Date(),
        })
        .where(eq(oauthAccounts.id, account.id));
    }

    const client = new GraphClient(accessToken);
    const userEmail = account.email!;

    let processed = 0;
    let skippedUnknown = 0;

    const deltaTokens = account.deltaToken
      ? (JSON.parse(account.deltaToken as string) as { inbox?: string; sent?: string })
      : {};

    for (const folder of ["inbox", "sentitems"] as const) {
      const deltaKey = folder === "inbox" ? "inbox" : "sent";

      const { messages, deltaToken: newDelta } = await syncFolder(
        client,
        folder,
        userEmail,
        deltaTokens[deltaKey]
      );

      for (const msg of messages) {
        try {
          const result = await processMessage(msg);
          if (result === "processed") processed++;
          else if (result === "skipped_unknown") skippedUnknown++;
        } catch (err) {
          console.error(`[sync] error processing message ${msg.providerMessageId}:`, err);
        }
      }

      if (newDelta) deltaTokens[deltaKey] = newDelta;
    }

    await db
      .update(oauthAccounts)
      .set({
        deltaToken: JSON.stringify(deltaTokens),
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(oauthAccounts.id, account.id));

    console.log(`[sync] complete: ${processed} processed, ${skippedUnknown} skipped`);
    return { processed, skippedUnknown };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sync] failed:", message);
    return { processed: 0, skippedUnknown: 0, error: message };
  } finally {
    _syncing = false;
  }
}

async function processMessage(msg: ProcessedMessage): Promise<"processed" | "skipped_unknown"> {
  const externalEmail = msg.direction === "inbound" ? msg.fromAddress : msg.toAddresses[0];
  if (!externalEmail) return "skipped_unknown";

  const domain = extractBusinessDomain(externalEmail);
  if (!domain) return "skipped_unknown";

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.domain, domain.toLowerCase()))
    .limit(1);

  if (!company) return "skipped_unknown";

  const contact = await findOrCreateContact({
    companyId: company.id,
    email: externalEmail,
    name: msg.direction === "inbound" ? msg.fromName : undefined,
  });

  const thread = await findOrCreateThread({
    companyId: company.id,
    providerThreadId: msg.providerThreadId || null,
    subject: msg.subject,
  });

  await upsertMessage({
    threadId: thread.id,
    companyId: company.id,
    contactId: contact.id,
    providerMessageId: msg.providerMessageId,
    direction: msg.direction,
    fromAddress: msg.fromAddress,
    toAddresses: msg.toAddresses,
    subject: msg.subject,
    bodyText: msg.bodyText,
    bodyHtml: msg.bodyHtml,
    receivedAt: msg.receivedAt,
  });

  await touchCompanyActivity(company.id);
  if (msg.direction === "outbound") {
    await markContacted(contact.id);
  } else {
    await markReplied(contact.id);
  }

  return "processed";
}
