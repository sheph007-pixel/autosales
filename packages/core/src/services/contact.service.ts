import { eq, desc, sql, and, or } from "drizzle-orm";
import { db, contacts } from "@autosales/db";
import type { Contact, NewContact } from "@autosales/db";
import { normalizeEmail, extractNameFromEmail } from "../utils/domain-extract";

export async function findOrCreateContact(opts: {
  companyId: string;
  email: string;
  name?: string;
  title?: string;
}): Promise<Contact> {
  const normalizedEmail = normalizeEmail(opts.email);

  const [existing] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.email, normalizedEmail))
    .limit(1);

  if (existing) {
    const updates: Partial<Contact> = {};
    if (opts.name && (!existing.name || existing.name === extractNameFromEmail(opts.email))) {
      updates.name = opts.name;
    }
    if (opts.title && !existing.title) {
      updates.title = opts.title;
    }
    if (Object.keys(updates).length > 0) {
      const [updated] = await db
        .update(contacts)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(contacts.id, existing.id))
        .returning();
      return updated!;
    }
    return existing;
  }

  const [created] = await db
    .insert(contacts)
    .values({
      companyId: opts.companyId,
      email: normalizedEmail,
      name: opts.name ?? extractNameFromEmail(opts.email),
      title: opts.title ?? null,
      status: "active",
    })
    .returning();

  return created!;
}

export async function getContact(id: string): Promise<Contact | null> {
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
  return contact ?? null;
}

export async function getContactByEmail(email: string): Promise<Contact | null> {
  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.email, normalizeEmail(email)))
    .limit(1);
  return contact ?? null;
}

export async function listContacts(opts: {
  companyId?: string;
  limit?: number;
  offset?: number;
  search?: string;
} = {}) {
  const { limit = 50, offset = 0, companyId, search } = opts;

  const conditions = [];
  if (companyId) conditions.push(eq(contacts.companyId, companyId));
  if (search) {
    conditions.push(
      or(
        sql`${contacts.email} ILIKE ${`%${search}%`}`,
        sql`${contacts.name} ILIKE ${`%${search}%`}`
      )!
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db
    .select()
    .from(contacts)
    .where(where)
    .orderBy(desc(contacts.lastRepliedAt))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(contacts)
    .where(where);

  return { contacts: results, total: Number(countResult?.count ?? 0) };
}

export async function markContacted(contactId: string) {
  await db
    .update(contacts)
    .set({ lastContactedAt: new Date(), updatedAt: new Date() })
    .where(eq(contacts.id, contactId));
}

export async function markReplied(contactId: string) {
  await db
    .update(contacts)
    .set({ lastRepliedAt: new Date(), lastContactedAt: new Date(), updatedAt: new Date() })
    .where(eq(contacts.id, contactId));
}

export async function updateContactStatus(contactId: string, status: string) {
  const [updated] = await db
    .update(contacts)
    .set({ status, updatedAt: new Date() })
    .where(eq(contacts.id, contactId))
    .returning();
  return updated;
}
