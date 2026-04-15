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
}

let _state: ScanState = { status: "idle", emailsScanned: 0, domainsFound: 0, folder: "" };
let _results: ScanDomain[] = [];

export function getScanState(): ScanState {
  return { ..._state };
}

export function getScanResults(): ScanDomain[] {
  return _results;
}

export async function startFullScan(): Promise<void> {
  if (_state.status === "scanning") return;

  _state = { status: "scanning", emailsScanned: 0, domainsFound: 0, folder: "" };
  _results = [];

  try {
    await ensureTables();

    const [account] = await db.select().from(oauthAccounts)
      .where(eq(oauthAccounts.provider, "microsoft")).limit(1);

    if (!account?.refreshToken) {
      _state = { ..._state, status: "error", error: "No Microsoft account connected" };
      return;
    }

    // Refresh token if needed
    let accessToken = account.accessToken!;
    if (account.tokenExpiresAt && account.tokenExpiresAt < new Date()) {
      console.log("[discover] refreshing token");
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

    console.log(`[discover] starting full scan for ${userEmail}`);

    const domainMap = new Map<string, {
      sentCount: number;
      receivedCount: number;
      contacts: Map<string, ScanContact>;
    }>();

    // Scan each folder
    const folders = ["inbox", "sentitems", "archive"] as const;
    const folderLabels = {
      inbox: "Inbox",
      sentitems: "Sent Items",
      archive: "Archive",
    } as const;

    for (const folder of folders) {
      _state = { ..._state, folder: folderLabels[folder] };

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
        } catch (err) {
          // Archive folder may not exist — skip silently
          if (folder === "archive") break;
          throw err;
        }

        for (const msg of response.value) {
          _state = { ..._state, emailsScanned: _state.emailsScanned + 1 };

          const from = (msg.from as Record<string, unknown>)?.emailAddress as Record<string, unknown> | undefined;
          const fromAddr = from?.address as string | undefined;
          const fromName = (from?.name as string) || "";
          if (!fromAddr) continue;

          const toList = ((msg.toRecipients as Array<Record<string, unknown>>) ?? [])
            .map((r) => (r?.emailAddress as Record<string, unknown>)?.address as string)
            .filter(Boolean);
          const ccList = ((msg.ccRecipients as Array<Record<string, unknown>>) ?? [])
            .map((r) => (r?.emailAddress as Record<string, unknown>)?.address as string)
            .filter(Boolean);

          const fromNorm = normalizeEmail(fromAddr);
          const isOutbound = fromNorm === userEmail;

          // Collect external addresses
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

            let agg = domainMap.get(domain);
            if (!agg) {
              agg = { sentCount: 0, receivedCount: 0, contacts: new Map() };
              domainMap.set(domain, agg);
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
            // Prefer real name over extracted-from-email
            if (ext.name && !contact.name.includes(" ") && ext.name.includes(" ")) {
              contact.name = ext.name;
            }
            if (isOutbound) contact.sentCount++;
            else contact.receivedCount++;
          }
        }

        _state = { ..._state, domainsFound: domainMap.size };
        url = response["@odata.nextLink"] ?? null;
      }

      console.log(`[discover] ${folderLabels[folder]}: ${_state.emailsScanned} emails total so far`);
    }

    // Build sorted results
    _results = Array.from(domainMap.entries())
      .map(([domain, agg]) => ({
        domain,
        sentCount: agg.sentCount,
        receivedCount: agg.receivedCount,
        totalCount: agg.sentCount + agg.receivedCount,
        contacts: Array.from(agg.contacts.values())
          .sort((a, b) => (b.sentCount + b.receivedCount) - (a.sentCount + a.receivedCount)),
      }))
      .sort((a, b) => b.totalCount - a.totalCount);

    _state = {
      status: "done",
      emailsScanned: _state.emailsScanned,
      domainsFound: _results.length,
      folder: "",
    };

    console.log(`[discover] done: ${_state.emailsScanned} emails, ${_state.domainsFound} domains`);
  } catch (err) {
    console.error("[discover] scan failed:", err);
    _state = {
      ..._state,
      status: "error",
      error: err instanceof Error ? err.message : String(err),
      folder: "",
    };
  }
}
