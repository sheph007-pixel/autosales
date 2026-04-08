import type PgBoss from "pg-boss";
import { db, oauthAccounts, emailMessages, companies, contacts } from "@autosales/db";
import { eq } from "drizzle-orm";
import { GraphClient, syncFolder, refreshAccessToken } from "@autosales/mail";
import type { ProcessedMessage } from "@autosales/mail";
import { findOrCreateCompany, touchCompanyActivity } from "@autosales/core/services/company.service";
import { findOrCreateContact, markContacted, markReplied } from "@autosales/core/services/contact.service";
import { findOrCreateThread, upsertMessage } from "@autosales/core/services/thread.service";
import { extractBusinessDomain, normalizeEmail } from "@autosales/core";
import { logAudit } from "@autosales/core/services/audit.service";

export async function handleSyncMailbox(job: PgBoss.Job) {
  console.log("Starting mailbox sync...");

  const [account] = await db
    .select()
    .from(oauthAccounts)
    .where(eq(oauthAccounts.provider, "microsoft"))
    .limit(1);

  if (!account || !account.refreshToken) {
    console.log("No Outlook account connected. Skipping sync.");
    return;
  }

  // Refresh token if needed
  let accessToken = account.accessToken!;
  if (account.tokenExpiresAt && account.tokenExpiresAt < new Date()) {
    console.log("Token expired, refreshing...");
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

  let totalProcessed = 0;
  let newCompanies = 0;
  let newContacts = 0;

  // Sync inbox
  const deltaTokens = account.deltaToken ? JSON.parse(account.deltaToken as string) as { inbox?: string; sent?: string } : {};

  for (const folder of ["inbox", "sentitems"] as const) {
    const deltaKey = folder === "inbox" ? "inbox" : "sent";
    console.log(`Syncing ${folder}...`);

    const { messages, deltaToken: newDelta } = await syncFolder(
      client,
      folder,
      userEmail,
      deltaTokens[deltaKey]
    );

    console.log(`Fetched ${messages.length} messages from ${folder}`);

    for (const msg of messages) {
      try {
        const result = await processMessage(msg, userEmail);
        if (result.newCompany) newCompanies++;
        if (result.newContact) newContacts++;
        totalProcessed++;
      } catch (err) {
        console.error(`Error processing message ${msg.providerMessageId}:`, err);
      }
    }

    if (newDelta) {
      deltaTokens[deltaKey] = newDelta;
    }
  }

  // Update sync state
  await db
    .update(oauthAccounts)
    .set({
      deltaToken: JSON.stringify(deltaTokens),
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(oauthAccounts.id, account.id));

  console.log(`Sync complete: ${totalProcessed} messages, ${newCompanies} new companies, ${newContacts} new contacts`);

  await logAudit({
    entityType: "system",
    entityId: account.id,
    action: "mailbox_synced",
    details: { totalProcessed, newCompanies, newContacts },
  });
}

async function processMessage(
  msg: ProcessedMessage,
  userEmail: string
): Promise<{ newCompany: boolean; newContact: boolean }> {
  let newCompany = false;
  let newContact = false;

  // Determine the external email (not ours)
  const externalEmail = msg.direction === "inbound" ? msg.fromAddress : msg.toAddresses[0];
  if (!externalEmail) return { newCompany, newContact };

  const domain = extractBusinessDomain(externalEmail);
  if (!domain) return { newCompany, newContact };

  // Find or create company (findOrCreateCompany returns existing or new)
  const companyBefore = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.domain, domain.toLowerCase()))
    .limit(1);
  const company = await findOrCreateCompany(domain);
  if (companyBefore.length === 0) newCompany = true;

  // Find or create contact
  const contactBefore = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.email, normalizeEmail(externalEmail)))
    .limit(1);
  const contact = await findOrCreateContact({
    companyId: company.id,
    email: externalEmail,
    name: msg.direction === "inbound" ? msg.fromName : undefined,
  });
  if (contactBefore.length === 0) newContact = true;

  // Find or create thread
  const thread = await findOrCreateThread({
    companyId: company.id,
    providerThreadId: msg.providerThreadId || null,
    subject: msg.subject,
  });

  // Upsert message (idempotent via providerMessageId)
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

  // Update activity timestamps
  await touchCompanyActivity(company.id);
  if (msg.direction === "outbound") {
    await markContacted(contact.id);
  } else {
    await markReplied(contact.id);
  }

  return { newCompany, newContact };
}
