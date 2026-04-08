import { eq, desc, sql, and } from "drizzle-orm";
import { db, emailThreads, emailMessages } from "@autosales/db";
import type { EmailThread, NewEmailThread, EmailMessage, NewEmailMessage } from "@autosales/db";

export async function findOrCreateThread(opts: {
  companyId: string;
  providerThreadId: string | null;
  subject: string | null;
}): Promise<EmailThread> {
  if (opts.providerThreadId) {
    const [existing] = await db
      .select()
      .from(emailThreads)
      .where(eq(emailThreads.providerThreadId, opts.providerThreadId))
      .limit(1);

    if (existing) return existing;
  }

  const [created] = await db
    .insert(emailThreads)
    .values({
      companyId: opts.companyId,
      providerThreadId: opts.providerThreadId,
      subject: opts.subject,
      messageCount: 0,
    })
    .returning();

  return created!;
}

export async function addMessageToThread(
  threadId: string,
  message: NewEmailMessage
): Promise<EmailMessage> {
  const [created] = await db.insert(emailMessages).values(message).returning();

  await db
    .update(emailThreads)
    .set({
      messageCount: sql`${emailThreads.messageCount} + 1`,
      lastMessageAt: message.receivedAt,
    })
    .where(eq(emailThreads.id, threadId));

  return created!;
}

export async function upsertMessage(message: NewEmailMessage): Promise<EmailMessage> {
  if (message.providerMessageId) {
    const [existing] = await db
      .select()
      .from(emailMessages)
      .where(eq(emailMessages.providerMessageId, message.providerMessageId))
      .limit(1);

    if (existing) return existing;
  }

  const [created] = await db.insert(emailMessages).values(message).returning();
  return created!;
}

export async function getThreadMessages(threadId: string): Promise<EmailMessage[]> {
  return db
    .select()
    .from(emailMessages)
    .where(eq(emailMessages.threadId, threadId))
    .orderBy(emailMessages.receivedAt);
}

export async function getCompanyMessages(
  companyId: string,
  limit: number = 50
): Promise<EmailMessage[]> {
  return db
    .select()
    .from(emailMessages)
    .where(eq(emailMessages.companyId, companyId))
    .orderBy(desc(emailMessages.receivedAt))
    .limit(limit);
}

export async function getRecentInboundMessages(limit: number = 20) {
  return db
    .select()
    .from(emailMessages)
    .where(eq(emailMessages.direction, "inbound"))
    .orderBy(desc(emailMessages.receivedAt))
    .limit(limit);
}

export async function getUnclassifiedMessages(limit: number = 50) {
  const result = await db.execute(sql`
    SELECT em.* FROM email_messages em
    LEFT JOIN classifications c ON c.message_id = em.id
    WHERE c.id IS NULL
    AND em.direction = 'inbound'
    ORDER BY em.received_at DESC
    LIMIT ${limit}
  `);
  return result as unknown as EmailMessage[];
}
