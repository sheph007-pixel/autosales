import { eq, desc, sql, and, isNull, or, lte } from "drizzle-orm";
import { db, companies, contacts, emailThreads, domainMemory, enrollments } from "@autosales/db";
import type { Company, NewCompany } from "@autosales/db";

export async function findOrCreateCompany(domain: string, companyName?: string): Promise<Company> {
  const existing = await db
    .select()
    .from(companies)
    .where(eq(companies.domain, domain.toLowerCase()))
    .limit(1);

  if (existing[0]) {
    if (companyName && !existing[0].companyName) {
      const [updated] = await db
        .update(companies)
        .set({ companyName, updatedAt: new Date() })
        .where(eq(companies.id, existing[0].id))
        .returning();
      return updated!;
    }
    return existing[0];
  }

  const [created] = await db
    .insert(companies)
    .values({
      domain: domain.toLowerCase(),
      companyName: companyName ?? null,
      status: "prospect",
      interestStatus: "unknown",
    })
    .returning();

  return created!;
}

export async function getCompany(id: string): Promise<Company | null> {
  const [company] = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
  return company ?? null;
}

export async function getCompanyByDomain(domain: string): Promise<Company | null> {
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.domain, domain.toLowerCase()))
    .limit(1);
  return company ?? null;
}

export async function listCompanies(opts: {
  limit?: number;
  offset?: number;
  status?: string;
  search?: string;
} = {}) {
  const { limit = 50, offset = 0, status, search } = opts;

  const conditions = [];
  if (status) conditions.push(eq(companies.status, status));
  if (search) {
    conditions.push(
      or(
        sql`${companies.domain} ILIKE ${`%${search}%`}`,
        sql`${companies.companyName} ILIKE ${`%${search}%`}`
      )!
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db
    .select()
    .from(companies)
    .where(where)
    .orderBy(desc(companies.lastActivityAt))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(companies)
    .where(where);

  return { companies: results, total: Number(countResult?.count ?? 0) };
}

export async function updateCompanyStatus(
  id: string,
  updates: Partial<Pick<Company, "status" | "interestStatus" | "renewalMonth" | "hasGroupHealthPlan" | "doNotContact" | "nextActionAt" | "summary">>
) {
  const [updated] = await db
    .update(companies)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(companies.id, id))
    .returning();
  return updated;
}

export async function touchCompanyActivity(id: string) {
  await db
    .update(companies)
    .set({ lastActivityAt: new Date(), updatedAt: new Date() })
    .where(eq(companies.id, id));
}

export async function getCompanyWithDetails(id: string) {
  const company = await getCompany(id);
  if (!company) return null;

  const [companyContacts, threads, memory, activeEnrollments] = await Promise.all([
    db.select().from(contacts).where(eq(contacts.companyId, id)).orderBy(desc(contacts.lastRepliedAt)),
    db.select().from(emailThreads).where(eq(emailThreads.companyId, id)).orderBy(desc(emailThreads.lastMessageAt)).limit(20),
    db.select().from(domainMemory).where(eq(domainMemory.companyId, id)).limit(1),
    db.select().from(enrollments).where(and(eq(enrollments.companyId, id), eq(enrollments.status, "active"))),
  ]);

  return {
    ...company,
    contacts: companyContacts,
    threads,
    memory: memory[0] ?? null,
    enrollments: activeEnrollments,
  };
}

export async function getCompaniesNeedingAction(limit: number = 20) {
  return db
    .select()
    .from(companies)
    .where(
      and(
        eq(companies.doNotContact, false),
        lte(companies.nextActionAt, new Date())
      )
    )
    .orderBy(companies.nextActionAt)
    .limit(limit);
}

export async function getDashboardStats() {
  const [stats] = await db.select({
    total: sql<number>`count(*)`,
    prospects: sql<number>`count(*) filter (where ${companies.status} = 'prospect')`,
    activeOpportunities: sql<number>`count(*) filter (where ${companies.status} = 'active_opportunity')`,
    clients: sql<number>`count(*) filter (where ${companies.status} = 'client')`,
    quoted: sql<number>`count(*) filter (where ${companies.status} = 'quoted')`,
    suppressed: sql<number>`count(*) filter (where ${companies.status} = 'suppressed')`,
    withRenewal: sql<number>`count(*) filter (where ${companies.renewalMonth} is not null)`,
    needsAction: sql<number>`count(*) filter (where ${companies.nextActionAt} <= now() and ${companies.doNotContact} = false)`,
  }).from(companies);

  return stats!;
}
