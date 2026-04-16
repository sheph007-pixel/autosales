import { GraphClient, refreshAccessToken } from "@autosales/mail";
import { db, oauthAccounts, discoveredDomains, discoveredContacts, ensureTables } from "@autosales/db";
import { eq, sql } from "drizzle-orm";
import { extractDomain, normalizeEmail, extractNameFromEmail } from "@autosales/core";

// ── State ──────────────────────────────────────────────────────────

export interface ScanState {
  status: "idle" | "scanning" | "cleaning" | "enriching" | "done" | "error";
  scanType: "full" | "quick" | null;
  emailsScanned: number;
  domainsSaved: number;
  contactsSaved: number;
  folder: string;
  cleaningProgress: string;
  enrichProgress: string;
  error?: string;
  lastScannedAt: string | null;
  hasProgress: boolean;
}

let _status: ScanState["status"] = "idle";
let _scanType: "full" | "quick" | null = null;
let _emailsScanned = 0;
let _folder = "";
let _cleaningProgress = "";
let _enrichProgress = "";
let _error = "";
let _lastScannedAt: string | null = null;
let _domainsSaved = 0;
let _contactsSaved = 0;
let _hasProgress = false;

export function getScanState(): ScanState {
  return {
    status: _status, scanType: _scanType, emailsScanned: _emailsScanned,
    domainsSaved: _domainsSaved, contactsSaved: _contactsSaved,
    folder: _folder, cleaningProgress: _cleaningProgress,
    enrichProgress: _enrichProgress,
    error: _status === "error" ? _error : undefined,
    lastScannedAt: _lastScannedAt, hasProgress: _hasProgress,
  };
}

// ── Scan progress (persisted in DB) ────────────────────────────────

interface ScanProgress {
  foldersCompleted: string[];
  currentFolder: string | null;
  lastPageLink: string | null;
  emailsScanned: number;
  startedAt: string;
  scanType: "full" | "quick";
}

async function loadProgress(accountId: string): Promise<ScanProgress | null> {
  const [row] = await db.select({ scanProgress: oauthAccounts.scanProgress })
    .from(oauthAccounts).where(eq(oauthAccounts.id, accountId)).limit(1);
  if (!row?.scanProgress) return null;
  try {
    const p = JSON.parse(row.scanProgress) as ScanProgress;
    // Only resume if < 24 hours old
    if (Date.now() - new Date(p.startedAt).getTime() > 24 * 60 * 60 * 1000) return null;
    return p;
  } catch { return null; }
}

async function saveProgress(accountId: string, progress: ScanProgress | null) {
  await db.update(oauthAccounts).set({
    scanProgress: progress ? JSON.stringify(progress) : null,
    updatedAt: new Date(),
  }).where(eq(oauthAccounts.id, accountId));
}

// ── Scan ───────────────────────────────────────────────────────────

export async function startScan(): Promise<void> {
  if (_status === "scanning" || _status === "cleaning") return;

  _status = "scanning";
  _emailsScanned = 0;
  _folder = "";
  _cleaningProgress = "";
  _error = "";

  try {
    await ensureTables();

    const [account] = await db.select().from(oauthAccounts)
      .where(eq(oauthAccounts.provider, "microsoft")).limit(1);
    if (!account?.refreshToken) { _status = "error"; _error = "No Microsoft account connected"; return; }

    // Load saved counts
    await refreshSavedCounts();

    // Check for resumable progress
    let progress = await loadProgress(account.id);

    // Resume or start fresh — ALWAYS full scan until all folders complete
    _scanType = "full";
    if (progress) {
      _emailsScanned = progress.emailsScanned;
      _folder = `Resuming...`;
      console.log(`[discover] resuming scan from ${progress.currentFolder}, ${progress.emailsScanned} emails done`);
    } else {
      progress = {
        foldersCompleted: [],
        currentFolder: null,
        lastPageLink: null,
        emailsScanned: 0,
        startedAt: new Date().toISOString(),
        scanType: "full",
      };
      console.log(`[discover] starting full scan`);
    }

    let accessToken = await getAccessToken(account.id);
    let client = new GraphClient(accessToken);
    const profile = await client.getProfile();
    const userEmail = normalizeEmail(profile.mail || profile.userPrincipalName);

    const folders = ["inbox", "sentitems", "archive"] as const;
    const labels: Record<string, string> = { inbox: "Inbox", sentitems: "Sent Items", archive: "Archive" };
    let foldersOk = 0;

    for (const folder of folders) {
      // Skip completed folders
      if (progress.foldersCompleted.includes(folder)) {
        console.log(`[discover] skipping ${folder} (already done)`);
        foldersOk++;
        continue;
      }

      _folder = labels[folder] ?? folder;

      // Refresh token between folders
      try { accessToken = await getAccessToken(account.id); client = new GraphClient(accessToken); } catch {}

      // Determine start URL — resume from saved page or start fresh
      let url: string | null;
      if (progress.currentFolder === folder && progress.lastPageLink) {
        url = progress.lastPageLink;
        console.log(`[discover] resuming ${folder} from saved page`);
      } else {
        const params = new URLSearchParams({ $select: "from,toRecipients,ccRecipients", $top: "500" });
        url = `/me/mailFolders/${folder}/messages?${params.toString()}`;
      }

      progress.currentFolder = folder;

      try {
        type P = { value: Array<Record<string, unknown>>; "@odata.nextLink"?: string };
        while (url) {
          const res: P = await client.request<P>(url);
          for (const msg of res.value) {
            _emailsScanned++;
            progress.emailsScanned = _emailsScanned;
            const result = extractFromMessage(msg, userEmail);
            if (result) await upsertToDB(result.domain, result.email, result.name, result.isOutbound);
          }

          url = res["@odata.nextLink"] ?? null;

          // Save progress after EVERY page (survives crash)
          progress.lastPageLink = url;
          await saveProgress(account.id, progress);
          await refreshSavedCounts();
        }

        // Folder complete
        progress.foldersCompleted.push(folder);
        progress.currentFolder = null;
        progress.lastPageLink = null;
        await saveProgress(account.id, progress);
        foldersOk++;
      } catch (err) {
        console.error(`[discover] ${labels[folder]} failed:`, err);
        // Save progress so we can resume this folder
        await saveProgress(account.id, progress);
      }

      _lastScannedAt = new Date().toISOString();
      await refreshSavedCounts();
    }

    if (foldersOk === 0) { _status = "error"; _error = "All folders failed"; _folder = ""; return; }

    // Clear progress — scan complete
    await saveProgress(account.id, null);
    _hasProgress = false;

    // AI cleanup
    _status = "cleaning";
    _folder = "";
    await cleanContactsWithAI();

    // Domain enrichment
    _status = "enriching";
    _cleaningProgress = "";
    await enrichDomains();

    _status = "done";
    _cleaningProgress = "";
    _enrichProgress = "";
    _folder = "";
    await refreshSavedCounts();
  } catch (err) {
    console.error("[discover] scan failed:", err);
    _status = "error";
    _error = err instanceof Error ? err.message : String(err);
    _folder = "";
  }
}

export const startFullScan = startScan;

// ── Extract from message ───────────────────────────────────────────

function extractFromMessage(msg: Record<string, unknown>, userEmail: string): { domain: string; email: string; name: string; isOutbound: boolean } | null {
  const from = (msg.from as Record<string, unknown>)?.emailAddress as Record<string, unknown> | undefined;
  const fromAddr = from?.address as string | undefined;
  if (!fromAddr) return null;

  const fromNorm = normalizeEmail(fromAddr);
  const isOutbound = fromNorm === userEmail;

  if (isOutbound) {
    const toList = ((msg.toRecipients as Array<Record<string, unknown>>) ?? [])
      .map((r) => (r?.emailAddress as Record<string, unknown>)?.address as string).filter(Boolean);
    const ccList = ((msg.ccRecipients as Array<Record<string, unknown>>) ?? [])
      .map((r) => (r?.emailAddress as Record<string, unknown>)?.address as string).filter(Boolean);

    const all = [...toList, ...ccList];
    if (all.length === 0) return null;

    // Upsert all recipients beyond the first
    for (let i = 1; i < all.length; i++) {
      const e = normalizeEmail(all[i]!);
      const d = extractDomain(e);
      if (d) upsertToDB(d, e, "", true).catch(() => {});
    }

    const firstEmail = normalizeEmail(all[0]!);
    const firstDomain = extractDomain(firstEmail);
    if (!firstDomain) return null;
    return { domain: firstDomain, email: firstEmail, name: "", isOutbound: true };
  } else {
    const fromName = (from?.name as string) || "";
    const domain = extractDomain(fromNorm);
    if (!domain) return null;
    return { domain, email: fromNorm, name: fromName, isOutbound: false };
  }
}

// ── Upsert to DB ───────────────────────────────────────────────────

async function upsertToDB(domain: string, email: string, name: string, isOutbound: boolean) {
  try {
    const rows = await db
      .insert(discoveredDomains)
      .values({ domain, sentCount: isOutbound ? 1 : 0, receivedCount: isOutbound ? 0 : 1, totalCount: 1 })
      .onConflictDoUpdate({
        target: discoveredDomains.domain,
        set: {
          sentCount: isOutbound ? sql`discovered_domains.sent_count + 1` : sql`discovered_domains.sent_count`,
          receivedCount: isOutbound ? sql`discovered_domains.received_count` : sql`discovered_domains.received_count + 1`,
          totalCount: sql`discovered_domains.total_count + 1`,
          updatedAt: sql`now()`,
        },
      })
      .returning({ id: discoveredDomains.id });

    const domainId = rows[0]?.id;
    if (!domainId) return;

    const displayName = name || extractNameFromEmail(email);
    await db
      .insert(discoveredContacts)
      .values({ domainId, email, rawName: displayName || null, sentCount: isOutbound ? 1 : 0, receivedCount: isOutbound ? 0 : 1 })
      .onConflictDoUpdate({
        target: discoveredContacts.email,
        set: {
          rawName: sql`COALESCE(NULLIF(${displayName}, ''), discovered_contacts.raw_name)`,
          sentCount: isOutbound ? sql`discovered_contacts.sent_count + 1` : sql`discovered_contacts.sent_count`,
          receivedCount: isOutbound ? sql`discovered_contacts.received_count` : sql`discovered_contacts.received_count + 1`,
          updatedAt: sql`now()`,
        },
      });
  } catch {}
}

// ── Helpers ─────────────────────────────────────────────────────────

async function refreshSavedCounts() {
  try {
    const [dc] = await db.select({ count: sql<number>`count(*)::int` }).from(discoveredDomains);
    const [cc] = await db.select({ count: sql<number>`count(*)::int` }).from(discoveredContacts);
    _domainsSaved = Number(dc?.count ?? 0);
    _contactsSaved = Number(cc?.count ?? 0);
  } catch {}
}

async function getAccessToken(accountId: string): Promise<string> {
  const [account] = await db.select().from(oauthAccounts).where(eq(oauthAccounts.id, accountId)).limit(1);
  if (!account?.accessToken) throw new Error("No access token");
  if (account.tokenExpiresAt && account.tokenExpiresAt < new Date()) {
    const tokens = await refreshAccessToken(account.refreshToken!);
    await db.update(oauthAccounts).set({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? account.refreshToken,
      tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      updatedAt: new Date(),
    }).where(eq(oauthAccounts.id, accountId));
    return tokens.access_token;
  }
  return account.accessToken;
}

// Unused but kept for API compat
export function getLiveResults() { return []; }
export function getLiveContacts() { return []; }

// ── AI cleanup ─────────────────────────────────────────────────────

async function cleanContactsWithAI() {
  try {
    const OpenAI = (await import("openai")).default;
    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI;
    if (!apiKey) throw new Error("No OPENAI_API_KEY");
    const openai = new OpenAI({ apiKey });

    const uncleaned = await db.select({
      id: discoveredContacts.id, email: discoveredContacts.email, rawName: discoveredContacts.rawName,
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
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "Extract contact info from emails. Return valid JSON only." },
            { role: "user", content: `For each contact, extract firstName, lastName, and company (human-readable from domain, e.g. "advocateinsure.com" → "Advocate Insure").\n\nContacts:\n${contactList}\n\nReturn: {"contacts":[{"index":1,"firstName":"...","lastName":"...","company":"..."},...]}`},
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
        });
        const content = response.choices[0]?.message?.content;
        if (!content) continue;
        const parsed = JSON.parse(content);
        const results: Array<{ index: number; firstName: string; lastName: string; company: string }> =
          Array.isArray(parsed) ? parsed : parsed.contacts || parsed.results || [];
        for (const r of results) {
          const c = batch[r.index - 1];
          if (!c) continue;
          await db.update(discoveredContacts).set({
            firstName: r.firstName || null, lastName: r.lastName || null,
            company: r.company || null, aiCleaned: true, updatedAt: new Date(),
          }).where(eq(discoveredContacts.id, c.id));
          cleaned++;
        }
      } catch {
        for (const c of batch) {
          await db.update(discoveredContacts).set({
            firstName: c.rawName?.split(" ")[0] || extractNameFromEmail(c.email).split(" ")[0] || null,
            lastName: c.rawName?.split(" ").slice(1).join(" ") || null,
            company: extractDomain(c.email) || null, aiCleaned: true, updatedAt: new Date(),
          }).where(eq(discoveredContacts.id, c.id));
          cleaned++;
        }
      }
    }
    _cleaningProgress = `Cleaned ${cleaned} contacts`;
  } catch (err) {
    console.error("[discover] AI cleanup skipped:", err);
    _cleaningProgress = "AI cleanup skipped";
  }
}

// ── Domain enrichment ──────────────────────────────────────────────

async function checkDomainLive(domain: string): Promise<boolean | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`https://${domain}`, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);
    return res.status >= 200 && res.status < 400;
  } catch {
    clearTimeout(timeout);
    return false;
  }
}

// Manually-triggered enrichment (sets status for UI polling)
export async function runEnrichment() {
  if (_status === "scanning" || _status === "cleaning" || _status === "enriching") return;
  _status = "enriching";
  _enrichProgress = "";
  try {
    await enrichDomains();
    _status = "done";
    _enrichProgress = "";
  } catch (err) {
    console.error("[discover] runEnrichment failed:", err);
    _status = "error";
    _error = err instanceof Error ? err.message : String(err);
  }
}

export async function enrichDomains() {
  try {
    const OpenAI = (await import("openai")).default;
    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI;
    if (!apiKey) { _enrichProgress = "Enrichment skipped (no API key)"; return; }
    const openai = new OpenAI({ apiKey });

    const unenriched = await db.select({
      id: discoveredDomains.id,
      domain: discoveredDomains.domain,
    }).from(discoveredDomains)
      .where(sql`${discoveredDomains.enrichedAt} IS NULL AND ${discoveredDomains.excluded} = false`)
      .limit(1000);

    if (unenriched.length === 0) { _enrichProgress = ""; return; }

    console.log(`[discover] enriching ${unenriched.length} domains`);
    let enriched = 0;
    const BATCH = 20;

    for (let i = 0; i < unenriched.length; i += BATCH) {
      const batch = unenriched.slice(i, i + BATCH);
      _enrichProgress = `Enriching domains... ${enriched}/${unenriched.length}`;

      // Parallel HTTP liveness checks
      const liveness = await Promise.all(batch.map((d) => checkDomainLive(d.domain)));

      // OpenAI enrichment
      const domainList = batch.map((d, idx) => `${idx + 1}. ${d.domain}`).join("\n");
      let results: Array<{ index: number; state: string | null; industry: string | null; companyActive: boolean | null }> = [];

      try {
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You identify companies from their domains. Return valid JSON only. If you don't know a company, return null for all fields." },
            { role: "user", content: `For each domain, return what you know: US state code (2 letters like "CA", "UT"), industry (short phrase like "Insurance", "Healthcare", "Tech"), companyActive (true if still operating, false if defunct, null if unknown).\n\nDomains:\n${domainList}\n\nReturn: {"results":[{"index":1,"state":"UT","industry":"Insurance","companyActive":true},...]}\n\nUse null for unknown. Don't guess.`},
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
        });
        const content = response.choices[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          results = Array.isArray(parsed) ? parsed : parsed.results || parsed.domains || [];
        }
      } catch (err) {
        console.error("[discover] enrichment batch failed:", err);
      }

      // Build result map
      const resultMap = new Map<number, typeof results[0]>();
      for (const r of results) resultMap.set(r.index, r);

      // Update DB
      for (let j = 0; j < batch.length; j++) {
        const d = batch[j]!;
        const r = resultMap.get(j + 1);
        const isLive = liveness[j];
        try {
          await db.update(discoveredDomains).set({
            state: r?.state || null,
            industry: r?.industry || null,
            companyActive: r?.companyActive ?? null,
            domainActive: isLive,
            enrichedAt: new Date(),
            updatedAt: new Date(),
          }).where(eq(discoveredDomains.id, d.id));
          enriched++;
        } catch (err) {
          console.error(`[discover] enrich DB update failed for ${d.domain}:`, err);
        }
      }
      _enrichProgress = `Enriching domains... ${enriched}/${unenriched.length}`;
    }

    _enrichProgress = `Enriched ${enriched} domains`;
    console.log(`[discover] enrichment done: ${enriched} domains`);
  } catch (err) {
    console.error("[discover] enrichment failed:", err);
    _enrichProgress = "Enrichment failed";
  }
}
