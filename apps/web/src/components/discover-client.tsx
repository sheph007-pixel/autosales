"use client";

import { useState, useEffect, useMemo, useCallback, Fragment } from "react";

// ── Types ──────────────────────────────────────────────────────────

interface Domain {
  id?: string;
  domain: string;
  sentCount: number;
  receivedCount: number;
  totalCount: number;
  excluded?: boolean;
  contactCount?: number;
}

interface Contact {
  id: string;
  domainId: string;
  email: string;
  rawName: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  sentCount: number;
  receivedCount: number;
  excluded: boolean;
  aiCleaned: boolean;
  domain: string;
}

interface ScanData {
  status: "idle" | "scanning" | "cleaning" | "done" | "error";
  emailsScanned: number;
  domainsFound: number;
  folder: string;
  cleaningProgress: string;
  error?: string;
  lastScannedAt: string | null;
  domains: Domain[];
  contacts: Contact[];
}

type Tab = "domains" | "contacts";
type DomainSort = "domain" | "sent" | "received" | "total";
type ContactSort = "firstName" | "lastName" | "company" | "email";
type SortDir = "asc" | "desc";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Main Component ─────────────────────────────────────────────────

export function DiscoverClient() {
  const [data, setData] = useState<ScanData>({
    status: "idle", emailsScanned: 0, domainsFound: 0, folder: "",
    cleaningProgress: "", lastScannedAt: null, domains: [], contacts: [],
  });
  const [tab, setTab] = useState<Tab>("domains");
  const [search, setSearch] = useState("");
  // Client-side hidden domains (works during scan + after)
  const [hiddenDomains, setHiddenDomains] = useState<Set<string>>(new Set());

  // Domain state — keyed by domain STRING, not DB id
  const [domainSort, setDomainSort] = useState<DomainSort>("total");
  const [domainDir, setDomainDir] = useState<SortDir>("desc");
  const [domainSelected, setDomainSelected] = useState<Set<string>>(new Set());
  const [domainExpanded, setDomainExpanded] = useState<Set<string>>(new Set());

  // Contact state
  const [contactSort, setContactSort] = useState<ContactSort>("company");
  const [contactDir, setContactDir] = useState<SortDir>("asc");
  const [contactSelected, setContactSelected] = useState<Set<string>>(new Set());

  // Fetch on mount
  useEffect(() => {
    fetch("/api/discover").then((r) => r.json()).then(setData).catch(() => {});
  }, []);

  // Poll while scanning/cleaning
  useEffect(() => {
    if (data.status !== "scanning" && data.status !== "cleaning") return;
    const id = setInterval(() => {
      fetch("/api/discover").then((r) => r.json()).then(setData).catch(() => {});
    }, 1000);
    return () => clearInterval(id);
  }, [data.status]);

  const startScan = useCallback(async () => {
    setData((s) => ({ ...s, status: "scanning", emailsScanned: 0, domainsFound: 0, folder: "", domains: [], contacts: [] }));
    setDomainSelected(new Set());
    setContactSelected(new Set());
    setHiddenDomains(new Set());
    await fetch("/api/discover", { method: "POST" }).catch(() => {});
  }, []);

  // Exclude domain — hide client-side + persist if has DB id
  const excludeDomain = useCallback((domainStr: string, dbId?: string) => {
    setHiddenDomains((p) => new Set(p).add(domainStr));
    setDomainSelected((p) => { const n = new Set(p); n.delete(domainStr); return n; });
    if (dbId) {
      fetch("/api/discover/exclude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "domain", id: dbId, excluded: true }),
      }).catch(() => {});
    }
  }, []);

  // Exclude contact — optimistic + persist
  const excludeContact = useCallback((id: string) => {
    setData((s) => ({ ...s, contacts: s.contacts.map((c) => c.id === id ? { ...c, excluded: true } : c) }));
    setContactSelected((p) => { const n = new Set(p); n.delete(id); return n; });
    fetch("/api/discover/exclude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "contact", id, excluded: true }),
    }).catch(() => {});
  }, []);

  // ── Domain filtering ─────────────────────────────────────────────

  const filteredDomains = useMemo(() => {
    let list = data.domains.filter((d) => !d.excluded && !hiddenDomains.has(d.domain));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((d) => d.domain.includes(q));
    }
    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (domainSort) {
        case "domain": cmp = a.domain.localeCompare(b.domain); break;
        case "sent": cmp = a.sentCount - b.sentCount; break;
        case "received": cmp = a.receivedCount - b.receivedCount; break;
        case "total": cmp = a.totalCount - b.totalCount; break;
      }
      return domainDir === "desc" ? -cmp : cmp;
    });
  }, [data.domains, hiddenDomains, search, domainSort, domainDir]);

  // ── Contact filtering ────────────────────────────────────────────

  const filteredContacts = useMemo(() => {
    // Exclude contacts from excluded/hidden domains
    const excludedDomains = new Set([
      ...hiddenDomains,
      ...data.domains.filter((d) => d.excluded).map((d) => d.domain),
    ]);
    let list = data.contacts.filter((c) => !c.excluded && !excludedDomains.has(c.domain));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        (c.firstName?.toLowerCase() || "").includes(q) ||
        (c.lastName?.toLowerCase() || "").includes(q) ||
        (c.company?.toLowerCase() || "").includes(q) ||
        c.email.includes(q)
      );
    }
    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (contactSort) {
        case "firstName": cmp = (a.firstName || "").localeCompare(b.firstName || ""); break;
        case "lastName": cmp = (a.lastName || "").localeCompare(b.lastName || ""); break;
        case "company": cmp = (a.company || "").localeCompare(b.company || ""); break;
        case "email": cmp = a.email.localeCompare(b.email); break;
      }
      return contactDir === "desc" ? -cmp : cmp;
    });
  }, [data.contacts, data.domains, hiddenDomains, search, contactSort, contactDir]);

  const doExport = () => {
    if (tab === "domains") {
      const list = domainSelected.size > 0
        ? filteredDomains.filter((d) => domainSelected.has(d.domain))
        : filteredDomains;
      const rows = [["Domain", "Sent", "Received", "Total"]];
      for (const d of list) rows.push([d.domain, String(d.sentCount), String(d.receivedCount), String(d.totalCount)]);
      downloadCSV(rows, "domains");
    } else {
      const list = contactSelected.size > 0
        ? filteredContacts.filter((c) => contactSelected.has(c.id))
        : filteredContacts;
      const rows = [["First Name", "Last Name", "Company", "Email"]];
      for (const c of list) rows.push([c.firstName || "", c.lastName || "", c.company || "", c.email]);
      downloadCSV(rows, "contacts");
    }
  };

  const isScanning = data.status === "scanning";
  const isCleaning = data.status === "cleaning";
  const isBusy = isScanning || isCleaning;
  const hasDomains = data.domains.length > 0;
  const selectedCount = tab === "domains" ? domainSelected.size : contactSelected.size;

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="border-b bg-card px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-bold">Kennion</h1>
          <div className="flex gap-1">
            <button
              onClick={() => { setTab("domains"); setSearch(""); }}
              className={`px-3 py-1 rounded text-sm font-medium ${tab === "domains" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >Domains</button>
            <button
              onClick={() => { setTab("contacts"); setSearch(""); }}
              className={`px-3 py-1 rounded text-sm font-medium ${tab === "contacts" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >Contacts</button>
          </div>
          {isBusy && (
            <span className="text-sm text-muted-foreground flex items-center gap-2">
              <span className="inline-block animate-spin h-3 w-3 border-2 border-primary border-t-transparent rounded-full" />
              {isScanning && <>Scanning {data.folder}... {data.emailsScanned.toLocaleString()} emails</>}
              {isCleaning && <>{data.cleaningProgress || "Cleaning contacts..."}</>}
            </span>
          )}
          {!isBusy && data.lastScannedAt && (
            <span className="text-sm text-muted-foreground">
              Last scan: {timeAgo(data.lastScannedAt)}
              {" \u00B7 "}{data.emailsScanned.toLocaleString()} emails
              {" \u00B7 "}{data.domainsFound.toLocaleString()} domains
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {selectedCount > 0 && <span className="text-xs text-muted-foreground">{selectedCount} selected</span>}
          {hiddenDomains.size > 0 && (
            <button onClick={() => setHiddenDomains(new Set())} className="text-xs text-muted-foreground hover:text-foreground">
              Show {hiddenDomains.size} hidden
            </button>
          )}
          {hasDomains && (
            <button onClick={doExport} className="px-3 py-1.5 border rounded text-sm hover:bg-muted">Export CSV</button>
          )}
          <button
            onClick={startScan}
            disabled={isBusy}
            className={`px-4 py-1.5 rounded text-sm font-medium ${isBusy ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
          >{isBusy ? "Scanning..." : hasDomains ? "Re-scan" : "Scan Mailbox"}</button>
        </div>
      </div>

      {data.status === "error" && (
        <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">{data.error}</div>
      )}

      {!hasDomains && !isBusy && data.status !== "error" && (
        <div className="flex items-center justify-center" style={{ height: "calc(100vh - 60px)" }}>
          <div className="text-center">
            <p className="text-muted-foreground mb-4">Scan your Outlook mailbox to discover domains and contacts.</p>
            <button onClick={startScan} className="px-6 py-2 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90">Scan Mailbox</button>
          </div>
        </div>
      )}

      {hasDomains && (
        <div className="px-6 pt-3 pb-6">
          <div className="mb-3">
            <input
              type="text"
              placeholder={tab === "domains" ? "Search domains..." : "Search contacts..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-3 py-1.5 border rounded text-sm bg-background w-72"
            />
          </div>

          {tab === "domains" ? (
            <DomainsTable
              domains={filteredDomains}
              contacts={data.contacts}
              selected={domainSelected}
              expanded={domainExpanded}
              sortKey={domainSort}
              sortDir={domainDir}
              onToggleSort={(key) => {
                if (domainSort === key) setDomainDir((d) => d === "desc" ? "asc" : "desc");
                else { setDomainSort(key); setDomainDir("desc"); }
              }}
              onToggleSelect={(d) => setDomainSelected((p) => { const n = new Set(p); n.has(d) ? n.delete(d) : n.add(d); return n; })}
              onToggleSelectAll={() => {
                const all = filteredDomains.map((d) => d.domain);
                if (domainSelected.size === all.length) setDomainSelected(new Set());
                else setDomainSelected(new Set(all));
              }}
              onToggleExpand={(d) => setDomainExpanded((p) => { const n = new Set(p); n.has(d) ? n.delete(d) : n.add(d); return n; })}
              onExclude={excludeDomain}
            />
          ) : (
            <ContactsTable
              contacts={filteredContacts}
              selected={contactSelected}
              sortKey={contactSort}
              sortDir={contactDir}
              onToggleSort={(key) => {
                if (contactSort === key) setContactDir((d) => d === "desc" ? "asc" : "desc");
                else { setContactSort(key); setContactDir("asc"); }
              }}
              onToggleSelect={(id) => setContactSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; })}
              onToggleSelectAll={() => {
                if (contactSelected.size === filteredContacts.length) setContactSelected(new Set());
                else setContactSelected(new Set(filteredContacts.map((c) => c.id)));
              }}
              onExclude={excludeContact}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Domains Table ──────────────────────────────────────────────────

function DomainsTable({
  domains, contacts, selected, expanded, sortKey, sortDir,
  onToggleSort, onToggleSelect, onToggleSelectAll, onToggleExpand, onExclude,
}: {
  domains: Domain[];
  contacts: Contact[];
  selected: Set<string>;
  expanded: Set<string>;
  sortKey: DomainSort;
  sortDir: SortDir;
  onToggleSort: (key: DomainSort) => void;
  onToggleSelect: (domain: string) => void;
  onToggleSelectAll: () => void;
  onToggleExpand: (domain: string) => void;
  onExclude: (domain: string, dbId?: string) => void;
}) {
  const arr = (key: DomainSort) => sortKey === key ? (sortDir === "desc" ? " \u2193" : " \u2191") : "";
  const allSelected = domains.length > 0 && selected.size === domains.length;

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr>
            <th className="p-3 w-10"><input type="checkbox" checked={allSelected} onChange={onToggleSelectAll} className="rounded" /></th>
            <th className="text-left p-3 font-medium"><button onClick={() => onToggleSort("domain")} className="hover:underline">Domain{arr("domain")}</button></th>
            <th className="text-right p-3 font-medium w-20"><button onClick={() => onToggleSort("sent")} className="hover:underline">Sent{arr("sent")}</button></th>
            <th className="text-right p-3 font-medium w-20"><button onClick={() => onToggleSort("received")} className="hover:underline">Recv{arr("received")}</button></th>
            <th className="text-right p-3 font-medium w-20"><button onClick={() => onToggleSort("total")} className="hover:underline">Total{arr("total")}</button></th>
            <th className="p-3 w-16" />
          </tr>
        </thead>
        <tbody>
          {domains.length === 0 ? (
            <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No domains match.</td></tr>
          ) : domains.map((d) => {
            const isExp = expanded.has(d.domain);
            const domainContacts = contacts.filter((c) => c.domain === d.domain && !c.excluded);
            const contactCount = d.contactCount ?? domainContacts.length;
            return (
              <Fragment key={d.domain}>
                <tr className="border-t hover:bg-muted/50">
                  <td className="p-3">
                    <input type="checkbox" checked={selected.has(d.domain)} onChange={() => onToggleSelect(d.domain)} className="rounded" />
                  </td>
                  <td className="p-3 font-medium cursor-pointer" onClick={() => onToggleExpand(d.domain)}>
                    {d.domain}
                    <span className="text-xs text-muted-foreground ml-2">{contactCount}</span>
                  </td>
                  <td className="p-3 text-right text-muted-foreground">{d.sentCount}</td>
                  <td className="p-3 text-right text-muted-foreground">{d.receivedCount}</td>
                  <td className="p-3 text-right font-medium">{d.totalCount}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      {contactCount > 0 && (
                        <button onClick={() => onToggleExpand(d.domain)} className="text-muted-foreground hover:text-foreground text-xs">
                          {isExp ? "\u25BC" : "\u25B6"}
                        </button>
                      )}
                      <button onClick={() => onExclude(d.domain, d.id)} className="text-muted-foreground hover:text-red-500 text-xs ml-1" title="Exclude">
                        {"\u2715"}
                      </button>
                    </div>
                  </td>
                </tr>
                {isExp && domainContacts.map((c) => (
                  <tr key={c.email} className="bg-muted/30">
                    <td className="p-3" />
                    <td className="p-3 pl-8">
                      <span className="text-sm">{c.firstName || c.lastName ? `${c.firstName || ""} ${c.lastName || ""}`.trim() : c.rawName || ""}</span>
                      <span className="text-xs text-muted-foreground ml-2">{c.email}</span>
                    </td>
                    <td className="p-3 text-right text-muted-foreground text-xs">{c.sentCount}</td>
                    <td className="p-3 text-right text-muted-foreground text-xs">{c.receivedCount}</td>
                    <td className="p-3 text-right text-xs">{c.sentCount + c.receivedCount}</td>
                    <td className="p-3" />
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Contacts Table ─────────────────────────────────────────────────

function ContactsTable({
  contacts, selected, sortKey, sortDir,
  onToggleSort, onToggleSelect, onToggleSelectAll, onExclude,
}: {
  contacts: Contact[];
  selected: Set<string>;
  sortKey: ContactSort;
  sortDir: SortDir;
  onToggleSort: (key: ContactSort) => void;
  onToggleSelect: (key: string) => void;
  onToggleSelectAll: () => void;
  onExclude: (id: string) => void;
}) {
  const arr = (key: ContactSort) => sortKey === key ? (sortDir === "desc" ? " \u2193" : " \u2191") : "";
  const allSelected = contacts.length > 0 && selected.size === contacts.length;

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr>
            <th className="p-3 w-10"><input type="checkbox" checked={allSelected} onChange={onToggleSelectAll} className="rounded" /></th>
            <th className="text-left p-3 font-medium"><button onClick={() => onToggleSort("firstName")} className="hover:underline">First Name{arr("firstName")}</button></th>
            <th className="text-left p-3 font-medium"><button onClick={() => onToggleSort("lastName")} className="hover:underline">Last Name{arr("lastName")}</button></th>
            <th className="text-left p-3 font-medium"><button onClick={() => onToggleSort("company")} className="hover:underline">Company{arr("company")}</button></th>
            <th className="text-left p-3 font-medium"><button onClick={() => onToggleSort("email")} className="hover:underline">Email{arr("email")}</button></th>
            <th className="p-3 w-10" />
          </tr>
        </thead>
        <tbody>
          {contacts.length === 0 ? (
            <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No contacts match.</td></tr>
          ) : contacts.map((c) => (
            <tr key={c.id} className="border-t hover:bg-muted/50">
              <td className="p-3"><input type="checkbox" checked={selected.has(c.id)} onChange={() => onToggleSelect(c.id)} className="rounded" /></td>
              <td className="p-3">{c.firstName || <span className="text-muted-foreground italic">--</span>}</td>
              <td className="p-3">{c.lastName || <span className="text-muted-foreground italic">--</span>}</td>
              <td className="p-3">{c.company || <span className="text-muted-foreground italic">--</span>}</td>
              <td className="p-3 text-muted-foreground">{c.email}</td>
              <td className="p-3">
                <button onClick={() => onExclude(c.id)} className="text-muted-foreground hover:text-red-500 text-xs" title="Exclude">{"\u2715"}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────

function downloadCSV(rows: string[][], prefix: string) {
  const csv = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${prefix}-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
}
