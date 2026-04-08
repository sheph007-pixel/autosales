import type PgBoss from "pg-boss";
import { db, oauthAccounts } from "@autosales/db";
import { eq } from "drizzle-orm";
import { GraphClient, refreshAccessToken } from "@autosales/mail";
import { logAudit } from "@autosales/core/services/audit.service";

interface SendEmailData {
  to: string;
  toName?: string;
  subject: string;
  body: string;
  companyId?: string;
  contactId?: string;
  enrollmentId?: string;
}

export async function handleSendEmail(job: PgBoss.Job<SendEmailData>) {
  const { to, toName, subject, body, companyId } = job.data;
  console.log(`Sending email to ${to}: "${subject}"...`);

  // Get OAuth account
  const [account] = await db
    .select()
    .from(oauthAccounts)
    .where(eq(oauthAccounts.provider, "microsoft"))
    .limit(1);

  if (!account || !account.accessToken) {
    throw new Error("No Outlook account connected. Cannot send email.");
  }

  // Refresh token if needed
  let accessToken = account.accessToken;
  if (account.tokenExpiresAt && account.tokenExpiresAt < new Date() && account.refreshToken) {
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
  await client.sendMail({
    to,
    toName,
    subject,
    body,
    isHtml: false,
  });

  console.log(`Email sent to ${to}`);

  if (companyId) {
    await logAudit({
      entityType: "company",
      entityId: companyId,
      action: "email_sent",
      details: { to, subject },
      performedBy: "system",
    });
  }
}
