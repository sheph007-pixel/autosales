import { GraphClient, refreshAccessToken } from "@autosales/mail";
import { db, oauthAccounts, discoveredDomains, discoveredContacts, ensureTables } from "@autosales/db";
import { eq, sql } from "drizzle-orm";
import { extractDomain, normalizeEmail, extractNameFromEmail } from "@autosales/core";

// ── State ──────────────────────────────────────────────────────────

export interface ScanState {
  status: "idle" | "scanning" | "cleaning" | "done" | "error";
  scanType: "full" | "quick" | null;
  emailsScanned: number;
  domainsSaved: number;
  contactsSaved: number;
  folder: string;
  cleaningProgress: string;
  error?: string;
  lastScannedAt: string | null;
  hasProgress: boolean; // true if there's a resumable scan in DB
}

let _status: ScanState["status"] = "idle";
let _scanType: "full" | "quick" | null = null;
let _emailsScanned = 0;
let _folder = "";
let _cleaningProgress = "";
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

    // Determine scan type
    if (progress) {
      // Resume existing scan
      _scanType = progress.scanType;
      _emailsScanned = progress.emailsScanned;
      _folder = `Resuming...`;
      console.log(`[discover] resuming ${_scanType} scan from ${progress.currentFolder}, ${progress.emailsScanned} emails already done`);
    } else {
      // New scan — check if we have data (= full scan done before)
      const [existing] = await db.select({ count: sql<number>`count(*)::int` }).from(discoveredDomains);
      const hasData = Number(existing?.count ?? 0) > 0;
      _scanType = hasData ? "quick" : "full";

      progress = {
        foldersCompleted: [],
        currentFolder: null,
        lastPageLink: null,
        emailsScanned: 0,
        startedAt: new Date().toISOString(),
        scanType: _scanType,
      };
      console.log(`[discover] starting ${_scanType} scan`);
    }

    const dateFilter = _scanType === "quick"
      ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      : null;

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
        if (dateFilter) params.set("$filter", `receivedDateTime ge ${dateFilter}`);
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

    _status = "done";
    _cleaningProgress = "";
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
