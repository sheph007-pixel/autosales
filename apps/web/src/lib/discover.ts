import { GraphClient, refreshAccessToken } from "@autosales/mail";
import { db, oauthAccounts, discoveredDomains, discoveredContacts, ensureTables } from "@autosales/db";
import { eq, sql } from "drizzle-orm";
import { extractDomain, normalizeEmail, extractNameFromEmail } from "@autosales/core";

// ── Types ──────────────────────────────────────────────────────────

export interface ScanState {
  status: "idle" | "scanning" | "cleaning" | "done" | "error";
  emailsScanned: number;
  domainsFound: number;
  folder: string;
  cleaningProgress: string;
  error?: string;
  lastScannedAt: string | null;
}

// ── Module state ───────────────────────────────────────────────────

let _status: ScanState["status"] = "idle";
let _emailsScanned = 0;
let _domainsFound = 0;
let _folder = "";
let _cleaningProgress = "";
let _error = "";
let _lastScannedAt: string | null = null;

// In-memory aggregation during scan
interface ContactAgg { email: string; name: string; sentCount: number; receivedCount: number; }
interface DomainAgg { sentCount: number; receivedCount: number; contacts: Map<string, ContactAgg>; }
const _domainMap = new Map<string, DomainAgg>();

export function getScanState(): ScanState {
  return {
    status: _status,
    emailsScanned: _emailsScanned,
    domainsFound: _status === "scanning" ? _domainMap.size : _domainsFound,
    folder: _folder,
    cleaningProgress: _cleaningProgress,
    error: _status === "error" ? _error : undefined,
    lastScannedAt: _lastScannedAt,
  };
}

// ── Live results (during scan, from memory) ────────────────────────

export interface LiveDomain {
  domain: string;
  sentCount: number;
  receivedCount: number;
  totalCount: number;
  contactCount: number;
}

export function getLiveResults(): LiveDomain[] {
  return Array.from(_domainMap.entries())
    .map(([domain, agg]) => ({
      domain,
      sentCount: agg.sentCount,
      receivedCount: agg.receivedCount,
      totalCount: agg.sentCount + agg.receivedCount,
      contactCount: agg.contacts.size,
    }))
    .sort((a, b) => b.totalCount - a.totalCount);
}

// ── Full scan ──────────────────────────────────────────────────────

export async function startFullScan(): Promise<void> {
  if (_status === "scanning" || _status === "cleaning") return;

  _status = "scanning";
  _emailsScanned = 0;
  _domainsFound = 0;
  _folder = "";
  _cleaningProgress = "";
  _error = "";
  _domainMap.clear();

  try {
    await ensureTables();

    const [account] = await db.select().from(oauthAccounts)
      .where(eq(oauthAccounts.provider, "microsoft")).limit(1);
    if (!account?.refreshToken) {
      _status = "error";
      _error = "No Microsoft account connected";
      return;
    }

    let accessToken = account.accessToken!;
    if (account.tokenExpiresAt && account.tokenExpiresAt < new Date()) {
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
    const profile = await client.getProfile();
    const userEmail = normalizeEmail(profile.mail || profile.userPrincipalName);

    // Phase 1: scan all folders
    const folders = ["inbox", "sentitems", "archive"] as const;
    const labels = { inbox: "Inbox", sentitems: "Sent Items", archive: "Archive" } as const;

    for (const folder of folders) {
      _folder = labels[folder];
      const params = new URLSearchParams({
        $select: "from,toRecipients,ccRecipients",
        $top: "250",
        $orderby: "receivedDateTime desc",
      });
      let url: string | null = `/me/mailFolders/${folder}/messages?${params.toString()}`;

      while (url) {
        let response;
        try {
          response = await client.request<{
            value: Array<Record<string, unknown>>;
            "@odata.nextLink"?: string;
          }>(url);
        } catch {
          if (folder === "archive") break;
          throw new Error(`Failed to scan ${labels[folder]}`);
        }
        for (const msg of response.value) {
          _emailsScanned++;
          processMessage(msg, userEmail);
        }
        url = response["@odata.nextLink"] ?? null;
      }
    }

    _folder = "";

    // Phase 2: persist to DB
    _folder = "Saving...";
    await persistToDatabase();
    _domainsFound = _domainMap.size;
    _lastScannedAt = new Date().toISOString();

    // Phase 3: AI cleanup
    _status = "cleaning";
    _folder = "";
    await cleanContactsWithAI();

    _status = "done";
    _cleaningProgress = "";
    _folder = "";
  } catch (err) {
    console.error("[discover] scan failed:", err);
    _status = "error";
    _error = err instanceof Error ? err.message : String(err);
    _folder = "";
  }
}

// ── Message processing (in-memory) ────────────────────────────────

function processMessage(msg: Record<string, unknown>, userEmail: string) {
  const from = (msg.from as Record<string, unknown>)?.emailAddress as Record<string, unknown> | undefined;
  const fromAddr = from?.address as string | undefined;
  const fromName = (from?.name as string) || "";
  if (!fromAddr) return;

  const toList = ((msg.toRecipients as Array<Record<string, unknown>>) ?? [])
    .map((r) => (r?.emailAddress as Record<string, unknown>)?.address as string).filter(Boolean);
  const ccList = ((msg.ccRecipients as Array<Record<string, unknown>>) ?? [])
    .map((r) => (r?.emailAddress as Record<string, unknown>)?.address as string).filter(Boolean);

  const fromNorm = normalizeEmail(fromAddr);
  const isOutbound = fromNorm === userEmail;

  const externals: Array<{ email: string; name: string }> = [];
  if (isOutbound) {
    for (const addr of [...toList, ...ccList]) externals.push({ email: normalizeEmail(addr), name: "" });
  } else {
    externals.push({ email: fromNorm, name: fromName });
  }

  for (const ext of externals) {
    const domain = extractDomain(ext.email);
    if (!domain) continue;

    let agg = _domainMap.get(domain);
    if (!agg) {
      agg = { sentCount: 0, receivedCount: 0, contacts: new Map() };
      _domainMap.set(domain, agg);
    }
    if (isOutbound) agg.sentCount++; else agg.receivedCount++;

    let contact = agg.contacts.get(ext.email);
    if (!contact) {
      contact = { email: ext.email, name: ext.name || extractNameFromEmail(ext.email), sentCount: 0, receivedCount: 0 };
      agg.contacts.set(ext.email, contact);
    }
    if (ext.name && !contact.name.includes(" ") && ext.name.includes(" ")) contact.name = ext.name;
    if (isOutbound) contact.sentCount++; else contact.receivedCount++;
  }
}

// ── Persist to DB ──────────────────────────────────────────────────

async function persistToDatabase() {
  for (const [domain, agg] of _domainMap.entries()) {
    const total = agg.sentCount + agg.receivedCount;

    // Upsert domain
    const [row] = await db
      .insert(discoveredDomains)
      .values({ domain, sentCount: agg.sentCount, receivedCount: agg.receivedCount, totalCount: total })
      .onConflictDoUpdate({
        target: discoveredDomains.domain,
        set: {
          sentCount: sql`${agg.sentCount}`,
          receivedCount: sql`${agg.receivedCount}`,
          totalCount: sql`${total}`,
          updatedAt: sql`now()`,
        },
      })
      .returning({ id: discoveredDomains.id });

    if (!row) continue;
    const domainId = row.id;

    // Upsert contacts
    for (const contact of agg.contacts.values()) {
      await db
        .insert(discoveredContacts)
        .values({
          domainId,
          email: contact.email,
          rawName: contact.name || null,
          sentCount: contact.sentCount,
          receivedCount: contact.receivedCount,
        })
        .onConflictDoUpdate({
          target: discoveredContacts.email,
          set: {
            rawName: sql`COALESCE(NULLIF(${contact.name}, ''), discovered_contacts.raw_name)`,
            sentCount: sql`${contact.sentCount}`,
            receivedCount: sql`${contact.receivedCount}`,
            updatedAt: sql`now()`,
          },
        });
    }
  }
}

// ── AI cleanup ─────────────────────────────────────────────────────

async function cleanContactsWithAI() {
  let openai;
  try {
    const OpenAI = (await import("openai")).default;
    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI;
    if (!apiKey) throw new Error("No OPENAI_API_KEY");
    openai = new OpenAI({ apiKey });
    const MODEL_MINI = "gpt-4o-mini";

    // Get uncleaned contacts
    const uncleaned = await db.select({
      id: discoveredContacts.id,
      email: discoveredContacts.email,
      rawName: discoveredContacts.rawName,
    }).from(discoveredContacts).where(eq(discoveredContacts.aiCleaned, false)).limit(2000);

    if (uncleaned.length === 0) return;

    const BATCH = 50;
    let cleaned = 0;

    for (let i = 0; i < uncleaned.length; i += BATCH) {
      const batch = uncleaned.slice(i, i + BATCH);
      _cleaningProgress = `Cleaning contacts... ${cleaned}/${uncleaned.length}`;

      const contactList = batch
        .map((c, idx) => `${idx + 1}. ${c.email}${c.rawName ? ` (display: "${c.rawName}")` : ""}`)
        .join("\n");

      try {
        const response = await openai.chat.completions.create({
          model: MODEL_MINI,
          messages: [
            {
              role: "system",
              content: "You extract structured contact info from email addresses and display names. Return valid JSON only.",
            },
            {
              role: "user",
              content: `For each contact, extract firstName, lastName, and company (a clean human-readable company name derived from the email domain, e.g. "advocateinsure.com" → "Advocate Insure", "healthez.com" → "HealthEZ").\n\nContacts:\n${contactList}\n\nReturn a JSON array: [{"index":1,"firstName":"...","lastName":"...","company":"..."},...]`,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
        });

        const content = response.choices[0]?.message?.content;
        if (!content) continue;

        const parsed = JSON.parse(content);
        const results: Array<{ index: number; firstName: string; lastName: string; company: string }> =
          Array.isArray(parsed) ? parsed : parsed.contacts || parsed.results || [];

        for (const result of results) {
          const contact = batch[result.index - 1];
          if (!contact) continue;

          await db.update(discoveredContacts).set({
            firstName: result.firstName || null,
            lastName: result.lastName || null,
            company: result.company || null,
            aiCleaned: true,
            updatedAt: new Date(),
          }).where(eq(discoveredContacts.id, contact.id));
          cleaned++;
        }
      } catch (err) {
        console.error("[discover] AI batch failed:", err);
        // Mark batch as cleaned anyway to avoid infinite retry
        for (const contact of batch) {
          await db.update(discoveredContacts).set({
            firstName: contact.rawName?.split(" ")[0] || extractNameFromEmail(contact.email).split(" ")[0] || null,
            lastName: contact.rawName?.split(" ").slice(1).join(" ") || null,
            company: extractDomain(contact.email) || null,
            aiCleaned: true,
            updatedAt: new Date(),
          }).where(eq(discoveredContacts.id, contact.id));
          cleaned++;
        }
      }
    }

    _cleaningProgress = `Cleaned ${cleaned} contacts`;
  } catch (err) {
    console.error("[discover] AI cleanup skipped:", err);
    _cleaningProgress = "AI cleanup skipped (no API key?)";
  }
}
