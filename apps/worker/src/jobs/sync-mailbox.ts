import type PgBoss from "pg-boss";
import { db, oauthAccounts, emailMessages, companies } from "@autosales/db";
import { eq } from "drizzle-orm";
import { GraphClient, syncFolder, refreshAccessToken } from "@autosales/mail";
import type { ProcessedMessage } from "@autosales/mail";
import { touchCompanyActivity } from "@autosales/core/services/company.service";
import { findOrCreateContact, markContacted, markReplied } from "@autosales/core/services/contact.service";
import { findOrCreateThread, upsertMessage } from "@autosales/core/services/thread.service";
import { extractBusinessDomain } from "@autosales/core";
import { logAudit } from "@autosales/core/services/audit.service";

/**
 * Mailbox sync — enrichment only.
 *
 * CRITICAL: we do NOT auto-create Groups from mailbox history. Only messages
 * whose external domain is already in `companies` are processed. Unknown
 * senders/recipients are silently skipped. This keeps the master Groups list
 * clean and under the user's manual control.
 *
 * For each new inbound message on a known Group, we queue a `classify-message`
 * job so the reply flows into classification → status update → memory update.
 */
export function makeSyncMailboxHandler(boss: PgBoss) {
  return async function handleSyncMailbox(_job: PgBoss.Job) {
    console.log("[sync] starting mailbox sync...");

    const [account] = await db
      .select()
      .from(oauthAccounts)
      .where(eq(oauthAccounts.provider, "microsoft"))
      .limit(1);

    if (!account || !account.refreshToken) {
      console.log("[sync] no Outlook account connected, skipping");
      return;
    }

    // Refresh token if needed
    let accessToken = account.accessToken!;
    if (account.tokenExpiresAt && account.tokenExpiresAt < new Date()) {
      console.log("[sync] token expired, refreshing");
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
    let queuedForClassification = 0;

    const deltaTokens = account.deltaToken
      ? (JSON.parse(account.deltaToken as string) as { inbox?: string; sent?: string })
      : {};

    for (const folder of ["inbox", "sentitems"] as const) {
      const deltaKey = folder === "inbox" ? "inbox" : "sent";
      console.log(`[sync] ${folder}...`);

      const { messages, deltaToken: newDelta } = await syncFolder(
        client,
        folder,
        userEmail,
        deltaTokens[deltaKey]
      );

      console.log(`[sync] fetched ${messages.length} messages from ${folder}`);

      for (const msg of messages) {
        try {
          const result = await processMessage(msg, boss);
          if (result === "processed") processed++;
          else if (result === "skipped_unknown") skippedUnknown++;
          if (result === "processed_new_inbound") {
            processed++;
            queuedForClassification++;
          }
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

    console.log(
      `[sync] complete: ${processed} processed, ${skippedUnknown} skipped (unknown domain), ${queuedForClassification} queued for classification`
    );

    await logAudit({
      entityType: "system",
      entityId: account.id,
      action: "mailbox_synced",
      details: { processed, skippedUnknown, queuedForClassification },
    });
  };
}

type ProcessResult = "processed" | "processed_new_inbound" | "skipped_unknown";

async function processMessage(msg: ProcessedMessage, boss: PgBoss): Promise<ProcessResult> {
  // Determine the external email (not ours)
  const externalEmail = msg.direction === "inbound" ? msg.fromAddress : msg.toAddresses[0];
  if (!externalEmail) return "skipped_unknown";

  const domain = extractBusinessDomain(externalEmail);
  if (!domain) return "skipped_unknown";

  // ENRICHMENT-ONLY: only process messages for Groups that already exist.
  // Never auto-create Groups from mailbox history.
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.domain, domain.toLowerCase()))
    .limit(1);

  if (!company) {
    return "skipped_unknown";
  }

  // Find or create contact under the known Group
  const contact = await findOrCreateContact({
    companyId: company.id,
    email: externalEmail,
    name: msg.direction === "inbound" ? msg.fromName : undefined,
  });

  // Find or create thread
  const thread = await findOrCreateThread({
    companyId: company.id,
    providerThreadId: msg.providerThreadId || null,
    subject: msg.subject,
  });

  // Detect whether this message is genuinely new (for classify-message triggering)
  let wasNew = false;
  if (msg.providerMessageId) {
    const [existing] = await db
      .select({ id: emailMessages.id })
      .from(emailMessages)
      .where(eq(emailMessages.providerMessageId, msg.providerMessageId))
      .limit(1);
    wasNew = !existing;
  } else {
    // No stable ID — treat as new so we don't silently drop
    wasNew = true;
  }

  const stored = await upsertMessage({
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

  // Update activity timestamps
  await touchCompanyActivity(company.id);
  if (msg.direction === "outbound") {
    await markContacted(contact.id);
  } else {
    await markReplied(contact.id);
  }

  // For new inbound messages on known Groups, queue classification. This is
  // what feeds the status/memory update loop and pauses enrollments on reply.
  if (wasNew && msg.direction === "inbound") {
    await boss.send("classify-message", { messageId: stored.id });
    return "processed_new_inbound";
  }

  return "processed";
}
