import { db, ensureTables, getLastSchemaError } from "@autosales/db";
import { sql } from "drizzle-orm";
import { isPersonalDomain, extractNameFromEmail } from "@autosales/core";
import { DiscoverClient } from "@/components/discover-client";

export const dynamic = "force-dynamic";

// Normalize drizzle/postgres-js result shape
function toRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown[] }).rows)) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

export interface DomainContact {
  email: string;
  name: string;
  sentCount: number;
  receivedCount: number;
}

export interface DomainGroup {
  domain: string;
  isPersonal: boolean;
  sentCount: number;
  receivedCount: number;
  totalCount: number;
  contacts: DomainContact[];
}

export default async function DiscoverPage() {
  try {
    return await renderDiscoverPage();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error && err.stack ? err.stack : "";
    console.error("Discover page fatal error:", err);
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4 text-red-900">Discover — render failed</h1>
        <div className="p-4 bg-red-50 border border-red-200 rounded">
          <p className="text-sm font-medium text-red-900 mb-2">Fatal error:</p>
          <pre className="text-xs font-mono whitespace-pre-wrap break-all text-red-800">
{message}
{stack ? "\n\n" + stack : ""}
          </pre>
        </div>
      </div>
    );
  }
}

async function renderDiscoverPage() {
  await ensureTables();

  let groups: DomainGroup[] = [];
  let totalEmails = 0;
  let errorMessage: string | null = null;

  try {
    // Query 1: domain aggregation
    const domainRaw = await db.execute(sql.raw(`
      SELECT
        LOWER(SPLIT_PART(external_email, '@', 2)) as domain,
        COUNT(*) FILTER (WHERE direction = 'outbound')::int as sent_count,
        COUNT(*) FILTER (WHERE direction = 'inbound')::int as received_count,
        COUNT(*)::int as total_count
      FROM (
        SELECT
          direction,
          CASE WHEN direction = 'inbound' THEN from_address
               ELSE to_addresses->>0
          END as external_email
        FROM email_messages
      ) sub
      WHERE external_email IS NOT NULL
        AND SPLIT_PART(external_email, '@', 2) != ''
      GROUP BY domain
      ORDER BY total_count DESC
    `));

    type DomainRow = {
      domain: string;
      sent_count: number | string;
      received_count: number | string;
      total_count: number | string;
    };
    const domainRows = toRows<DomainRow>(domainRaw);

    // Query 2: contact breakdown per domain
    const contactRaw = await db.execute(sql.raw(`
      SELECT
        LOWER(SPLIT_PART(external_email, '@', 2)) as domain,
        LOWER(external_email) as email,
        COUNT(*) FILTER (WHERE direction = 'outbound')::int as sent_count,
        COUNT(*) FILTER (WHERE direction = 'inbound')::int as received_count
      FROM (
        SELECT
          direction,
          CASE WHEN direction = 'inbound' THEN from_address
               ELSE to_addresses->>0
          END as external_email
        FROM email_messages
      ) sub
      WHERE external_email IS NOT NULL
        AND SPLIT_PART(external_email, '@', 2) != ''
      GROUP BY domain, email
      ORDER BY domain, (COUNT(*)) DESC
    `));

    type ContactRow = {
      domain: string;
      email: string;
      sent_count: number | string;
      received_count: number | string;
    };
    const contactRows = toRows<ContactRow>(contactRaw);

    // Build contact map: domain -> contacts[]
    const contactMap = new Map<string, DomainContact[]>();
    for (const c of contactRows) {
      const list = contactMap.get(c.domain) ?? [];
      list.push({
        email: c.email,
        name: extractNameFromEmail(c.email),
        sentCount: Number(c.sent_count),
        receivedCount: Number(c.received_count),
      });
      contactMap.set(c.domain, list);
    }

    // Stitch together
    groups = domainRows.map((d) => ({
      domain: d.domain,
      isPersonal: isPersonalDomain(d.domain),
      sentCount: Number(d.sent_count),
      receivedCount: Number(d.received_count),
      totalCount: Number(d.total_count),
      contacts: contactMap.get(d.domain) ?? [],
    }));

    totalEmails = groups.reduce((sum, g) => sum + g.totalCount, 0);
  } catch (err) {
    errorMessage = err instanceof Error ? (err.stack ?? err.message) : String(err);
    console.error("Discover page error:", err);
  }

  const schemaErr = getLastSchemaError();
  if (schemaErr) {
    errorMessage = errorMessage ? `${errorMessage}\n---\nSchema: ${schemaErr}` : `Schema: ${schemaErr}`;
  }

  return (
    <div>
      {errorMessage && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded">
          <p className="text-sm font-medium text-red-900">Error loading data:</p>
          <p className="text-xs text-red-700 mt-1 font-mono break-all">{errorMessage}</p>
        </div>
      )}
      <DiscoverClient groups={groups} totalEmails={totalEmails} />
    </div>
  );
}
