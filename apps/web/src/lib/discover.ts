import { GraphClient, refreshAccessToken } from "@autosales/mail";
import { db, oauthAccounts, ensureTables } from "@autosales/db";
import { eq } from "drizzle-orm";
import { extractDomain, normalizeEmail, extractNameFromEmail } from "@autosales/core";

export interface ScanContact {
  email: string;
  name: string;
  sentCount: number;
  receivedCount: number;
}

export interface ScanDomain {
  domain: string;
  sentCount: number;
  receivedCount: number;
  totalCount: number;
  contacts: ScanContact[];
}

export interface ScanState {
  status: "idle" | "scanning" | "done" | "error";
  emailsScanned: number;
  domainsFound: number;
  folder: string;
  error?: string;
  lastScannedAt: string | null;
}

interface ContactAgg {
  email: string;
  name: string;
  sentCount: number;
  receivedCount: number;
}

let _status: "idle" | "scanning" | "done" | "error" = "idle";
let _emailsScanned = 0;
let _folder = "";
let _error = "";
let _lastScannedAt: string | null = null;

// Live map — getScanResults() reads from this at any time
const _domainMap = new Map<string, {
  sentCount: number;
  receivedCount: number;
  contacts: Map<string, ContactAgg>;
}>();

export function getScanState(): ScanState {
  return {
    status: _status,
    emailsScanned: _emailsScanned,
    domainsFound: _domainMap.size,
    folder: _folder,
    error: _status === "error" ? _error : undefined,
    lastScannedAt: _lastScannedAt,
  };
}

// Converts live map to sorted array — called on every GET poll
export function getScanResults(): ScanDomain[] {
  return Array.from(_domainMap.entries())
    .map(([domain, agg]) => ({
      domain,
      sentCount: agg.sentCount,
      receivedCount: agg.receivedCount,
      totalCount: agg.sentCount + agg.receivedCount,
      contacts: Array.from(agg.contacts.values())
        .sort((a, b) => (b.sentCount + b.receivedCount) - (a.sentCount + a.receivedCount)),
    }))
    .sort((a, b) => b.totalCount - a.totalCount);
}

export async function startFullScan(): Promise<void> {
  if (_status === "scanning") return;

  _status = "scanning";
  _emailsScanned = 0;
  _folder = "";
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

    _status = "done";
    _folder = "";
    _lastScannedAt = new Date().toISOString();
  } catch (err) {
    _status = "error";
    _error = err instanceof Error ? err.message : String(err);
    _folder = "";
  }
}

function processMessage(msg: Record<string, unknown>, userEmail: string) {
  const from = (msg.from as Record<string, unknown>)?.emailAddress as Record<string, unknown> | undefined;
  const fromAddr = from?.address as string | undefined;
  const fromName = (from?.name as string) || "";
  if (!fromAddr) return;

  const toList = ((msg.toRecipients as Array<Record<string, unknown>>) ?? [])
    .map((r) => (r?.emailAddress as Record<string, unknown>)?.address as string)
    .filter(Boolean);
  const ccList = ((msg.ccRecipients as Array<Record<string, unknown>>) ?? [])
    .map((r) => (r?.emailAddress as Record<string, unknown>)?.address as string)
    .filter(Boolean);

  const fromNorm = normalizeEmail(fromAddr);
  const isOutbound = fromNorm === userEmail;

  const externals: Array<{ email: string; name: string }> = [];
  if (isOutbound) {
    for (const addr of [...toList, ...ccList]) {
      externals.push({ email: normalizeEmail(addr), name: "" });
    }
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

    if (isOutbound) agg.sentCount++;
    else agg.receivedCount++;

    let contact = agg.contacts.get(ext.email);
    if (!contact) {
      contact = {
        email: ext.email,
        name: ext.name || extractNameFromEmail(ext.email),
        sentCount: 0,
        receivedCount: 0,
      };
      agg.contacts.set(ext.email, contact);
    }
    if (ext.name && !contact.name.includes(" ") && ext.name.includes(" ")) {
      contact.name = ext.name;
    }
    if (isOutbound) contact.sentCount++;
    else contact.receivedCount++;
  }
}
