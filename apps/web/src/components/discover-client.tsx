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
  id?: string;
  domainId?: string;
  email: string;
  name?: string;
  rawName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  sentCount: number;
  receivedCount: number;
  excluded?: boolean;
  aiCleaned?: boolean;
  domain: string;
}

interface ScanData {
  status: "idle" | "scanning" | "cleaning" | "done" | "error";
  scanType?: "full" | "quick" | null;
  emailsScanned: number;
  domainsFound: number;
  domainsSaved?: number;
  contactsSaved?: number;
  excludedDomainCount?: number;
  excludedContactCount?: number;
  folder: string;
  cleaningProgress: string;
  error?: string;
  lastScannedAt: string | null;
  domains: Domain[];
  contacts: Contact[];
}

type Tab = "domains" | "contacts" | "excluded";
type DomainSort = "domain" | "sent" | "received" | "total";
type ContactSort = "firstName" | "lastName" | "company" | "email";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 50;

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
  const [page, setPage] = useState(1);
  const [hiddenDomains, setHiddenDomains] = useState<Set<string>>(new Set());

  const [domainSort, setDomainSort] = useState<DomainSort>("total");
  const [domainDir, setDomainDir] = useState<SortDir>("desc");
  const [domainSelected, setDomainSelected] = useState<Set<string>>(new Set());
  const [domainExpanded, setDomainExpanded] = useState<Set<string>>(new Set());

  const [contactSort, setContactSort] = useState<ContactSort>("company");
  const [contactDir, setContactDir] = useState<SortDir>("asc");
  const [contactSelected, setContactSelected] = useState<Set<string>>(new Set());

  // Reset page when search or tab changes
  useEffect(() => { setPage(1); }, [search, tab]);

  useEffect(() => {
    fetch("/api/discover").then((r) => r.json()).then(setData).catch(() => {});
  }, []);

  useEffect(() => {
    if (data.status !== "scanning" && data.status !== "cleaning") return;
    const id = setInterval(() => {
      fetch("/api/discover").then((r) => r.json()).then(setData).catch(() => {});
    }, 1000);
    return () => clearInterval(id);
  }, [data.status]);

  const doScan = useCallback(async () => {
    setData((s) => ({ ...s, status: "scanning", emailsScanned: 0, folder: "", domains: s.domains, contacts: s.contacts }));
    setDomainSelected(new Set());
    setContactSelected(new Set());
    await fetch("/api/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }).catch(() => {});
  }, []);

  const excludeDomain = useCallback((domainStr: string, dbId?: string) => {
    setHiddenDomains((p) => new Set(p).add(domainStr));
    setDomainSelected((p) => { const n = new Set(p); n.delete(domainStr); return n; });
    // Always send domain string so it works even if DB id isn't available yet
    fetch("/api/discover/exclude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "domain", ids: dbId ? [dbId] : [], domains: [domainStr], excluded: true }),
    }).catch(() => {});
  }, []);

  const excludeContact = useCallback((email: string, dbId?: string) => {
    setData((s) => ({ ...s, contacts: s.contacts.map((c) => c.email === email ? { ...c, excluded: true } : c) }));
    setContactSelected((p) => { const n = new Set(p); n.delete(email); return n; });
    fetch("/api/discover/exclude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "contact", ids: dbId ? [dbId] : [], emails: [email], excluded: true }),
    }).catch(() => {});
  }, []);

  const excludeSelectedDomains = useCallback(() => {
    const sel = new Set(domainSelected);
    const domainStrs = Array.from(sel);
    setHiddenDomains((p) => { const n = new Set(p); for (const d of sel) n.add(d); return n; });
    const dbIds = data.domains.filter((d) => d.id && sel.has(d.domain)).map((d) => d.id!);
    fetch("/api/discover/exclude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "domain", ids: dbIds, domains: domainStrs, excluded: true }),
    }).catch(() => {});
    setDomainSelected(new Set());
  }, [domainSelected, data.domains]);

  const excludeSelectedContacts = useCallback(() => {
    const sel = new Set(contactSelected);
    const emailStrs = Array.from(sel);
    setData((s) => ({ ...s, contacts: s.contacts.map((c) => sel.has(c.email) ? { ...c, excluded: true } : c) }));
    const dbIds = data.contacts.filter((c) => c.id && sel.has(c.email)).map((c) => c.id!);
    fetch("/api/discover/exclude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "contact", ids: dbIds, emails: emailStrs, excluded: true }),
    }).catch(() => {});
    setContactSelected(new Set());
  }, [contactSelected, data.contacts]);

  const restoreItem = useCallback((type: "domain" | "contact", id: string, domainStr?: string) => {
    if (type === "domain") {
      setData((s) => ({ ...s, domains: s.domains.map((d) => d.id === id ? { ...d, excluded: false } : d) }));
      if (domainStr) setHiddenDomains((p) => { const n = new Set(p); n.delete(domainStr); return n; });
    } else {
      setData((s) => ({ ...s, contacts: s.contacts.map((c) => c.id === id ? { ...c, excluded: false } : c) }));
    }
    fetch("/api/discover/exclude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, ids: [id], excluded: false }),
    }).catch(() => {});
  }, []);

  // ── Filtering ────────────────────────────────────────────────────

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

  const filteredContacts = useMemo(() => {
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
        (c.name?.toLowerCase() || "").includes(q) ||
        c.email.includes(q) || c.domain.includes(q)
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

  const excludedDomains = useMemo(() => data.domains.filter((d) => d.excluded), [data.domains]);
  const excludedContacts = useMemo(() => data.contacts.filter((c) => c.excluded), [data.contacts]);
  const totalExcluded = excludedDomains.length + excludedContacts.length;

  // Pagination
  const currentList = tab === "domains" ? filteredDomains : filteredContacts;
  const totalPages = Math.max(1, Math.ceil(currentList.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const doExport = () => {
    if (tab === "domains") {
      const list = domainSelected.size > 0 ? filteredDomains.filter((d) => domainSelected.has(d.domain)) : filteredDomains;
      const rows = [["Domain", "Sent", "Received", "Total"]];
      for (const d of list) rows.push([d.domain, String(d.sentCount), String(d.receivedCount), String(d.totalCount)]);
      downloadCSV(rows, "domains");
    } else {
      const list = contactSelected.size > 0 ? filteredContacts.filter((c) => contactSelected.has(c.email)) : filteredContacts;
      const rows = [["First Name", "Last Name", "Company", "Email", "Sent", "Received", "Total"]];
      for (const c of list) rows.push([c.firstName || c.name || "", c.lastName || "", c.company || c.domain, c.email, String(c.sentCount), String(c.receivedCount), String(c.sentCount + c.receivedCount)]);
      downloadCSV(rows, "contacts");
    }
  };

  const isScanning = data.status === "scanning";
  const isCleaning = data.status === "cleaning";
  const isBusy = isScanning || isCleaning;
  const hasDomains = data.domains.length > 0;
  const selectedCount = tab === "domains" ? domainSelected.size : contactSelected.size;
  const savedDomains = data.domainsSaved ?? filteredDomains.length;
  const savedContacts = data.contactsSaved ?? filteredContacts.length;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div className="border-b bg-card px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-5">
          <h1 className="text-lg font-bold">Kennion</h1>
          <div className="flex gap-1">
            {(["domains", "contacts", "excluded"] as Tab[]).map((t) => {
              const label = t === "domains" ? `Domains (${filteredDomains.length})`
                : t === "contacts" ? `Contacts (${filteredContacts.length})`
                : `Excluded (${totalExcluded})`;
              return (
                <button
                  key={t}
                  onClick={() => { setTab(t); setSearch(""); }}
                  className={`px-3 py-1 rounded text-sm font-medium ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                >{label}</button>
              );
            })}
          </div>
          {/* Status */}
          {isBusy ? (
            <span className="text-sm text-muted-foreground flex items-center gap-2">
              <span className="inline-block animate-spin h-3 w-3 border-2 border-primary border-t-transparent rounded-full" />
              {isScanning && (
                <>
                  Scanning {data.folder}...
                  {" "}{data.emailsScanned.toLocaleString()} emails
                  {(data.domainsSaved ?? 0) > 0 && <> &middot; Saved: {data.domainsSaved} domains, {data.contactsSaved} contacts</>}
                </>
              )}
              {isCleaning && <>{data.cleaningProgress || "Cleaning contacts..."}</>}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">
              {savedDomains > 0 && <>{savedDomains.toLocaleString()} domains &middot; {savedContacts.toLocaleString()} contacts saved</>}
              {data.lastScannedAt && <> &middot; Last scan: {timeAgo(data.lastScannedAt)}</>}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selectedCount > 0 && tab !== "excluded" && (
            <>
              <span className="text-xs text-muted-foreground">{selectedCount} selected</span>
              <button
                onClick={tab === "domains" ? excludeSelectedDomains : excludeSelectedContacts}
                className="px-3 py-1.5 border border-red-200 text-red-600 rounded text-sm hover:bg-red-50"
              >Exclude Selected</button>
            </>
          )}
          {hasDomains && tab !== "excluded" && (
            <button onClick={doExport} className="px-3 py-1.5 border rounded text-sm hover:bg-muted">Export CSV</button>
          )}
          <div>
            <button
              onClick={() => doScan()}
              disabled={isBusy}
              className={`px-4 py-1.5 rounded text-sm font-medium ${isBusy ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
            >{isBusy ? "Scanning..." : "Scan"}</button>
          </div>
        </div>
      </div>

      {data.status === "error" && (
        <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">{data.error}</div>
      )}

      {/* ── Empty state ─────────────────────────────────────────── */}
      {!hasDomains && !isBusy && data.status !== "error" && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-muted-foreground mb-4">Scan your Outlook mailbox to discover domains and contacts.</p>
            <button onClick={() => doScan()} className="px-6 py-2 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90">Scan Mailbox</button>
          </div>
        </div>
      )}

      {/* ── Content ─────────────────────────────────────────────── */}
      {(hasDomains || isBusy) && (
        <div className="flex-1 flex flex-col px-6 pt-3 pb-6">
          {tab !== "excluded" && (
            <div className="mb-3">
              <input
                type="text"
                placeholder={tab === "domains" ? "Search domains..." : "Search contacts..."}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="px-3 py-1.5 border rounded text-sm bg-background w-72"
              />
            </div>
          )}

          {tab === "domains" && (
            <>
              <div className="flex-1 border rounded-lg overflow-hidden bg-card flex flex-col">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="p-3 w-10"><input type="checkbox" checked={filteredDomains.length > 0 && domainSelected.size === filteredDomains.length} onChange={() => { const all = filteredDomains.map((d) => d.domain); domainSelected.size === all.length ? setDomainSelected(new Set()) : setDomainSelected(new Set(all)); }} className="rounded" /></th>
                      <Th onClick={() => toggleDomainSort("domain")} label="Domain" sortKey={domainSort} thisKey="domain" dir={domainDir} />
                      <Th onClick={() => toggleDomainSort("sent")} label="Sent" sortKey={domainSort} thisKey="sent" dir={domainDir} right />
                      <Th onClick={() => toggleDomainSort("received")} label="Recv" sortKey={domainSort} thisKey="received" dir={domainDir} right />
                      <Th onClick={() => toggleDomainSort("total")} label="Total" sortKey={domainSort} thisKey="total" dir={domainDir} right />
                      <th className="p-3 w-16" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDomains.length === 0 ? (
                      <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No domains match.</td></tr>
                    ) : filteredDomains.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE).map((d) => {
                      const isExp = domainExpanded.has(d.domain);
                      const domainContacts = data.contacts.filter((c) => c.domain === d.domain && !c.excluded);
                      const cc = d.contactCount ?? domainContacts.length;
                      return (
                        <Fragment key={d.domain}>
                          <tr className="border-t hover:bg-muted/50">
                            <td className="p-3"><input type="checkbox" checked={domainSelected.has(d.domain)} onChange={() => setDomainSelected((p) => { const n = new Set(p); n.has(d.domain) ? n.delete(d.domain) : n.add(d.domain); return n; })} className="rounded" /></td>
                            <td className="p-3 font-medium cursor-pointer" onClick={() => setDomainExpanded((p) => { const n = new Set(p); n.has(d.domain) ? n.delete(d.domain) : n.add(d.domain); return n; })}>
                              {d.domain} <span className="text-xs text-muted-foreground">{cc}</span>
                            </td>
                            <td className="p-3 text-right text-muted-foreground">{d.sentCount}</td>
                            <td className="p-3 text-right text-muted-foreground">{d.receivedCount}</td>
                            <td className="p-3 text-right font-medium">{d.totalCount}</td>
                            <td className="p-3">
                              <div className="flex items-center gap-1">
                                {cc > 0 && <button onClick={() => setDomainExpanded((p) => { const n = new Set(p); n.has(d.domain) ? n.delete(d.domain) : n.add(d.domain); return n; })} className="text-muted-foreground hover:text-foreground text-xs">{isExp ? "\u25BC" : "\u25B6"}</button>}
                                <button onClick={() => excludeDomain(d.domain, d.id)} className="text-muted-foreground hover:text-red-500 text-xs ml-1" title="Exclude">{"\u2715"}</button>
                              </div>
                            </td>
                          </tr>
                          {isExp && domainContacts.map((c) => (
                            <tr key={c.email} className="bg-muted/30">
                              <td className="p-3" />
                              <td className="p-3 pl-8">
                                <span className="text-sm">{c.firstName || c.lastName ? `${c.firstName || ""} ${c.lastName || ""}`.trim() : c.rawName || c.name || ""}</span>
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
              <Pagination page={safePage} total={totalPages} count={filteredDomains.length} onPage={setPage} />
            </>
          )}

          {tab === "contacts" && (
            <>
              <div className="flex-1 border rounded-lg overflow-hidden bg-card flex flex-col">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="p-3 w-10"><input type="checkbox" checked={filteredContacts.length > 0 && contactSelected.size === filteredContacts.length} onChange={() => { contactSelected.size === filteredContacts.length ? setContactSelected(new Set()) : setContactSelected(new Set(filteredContacts.map((c) => c.email))); }} className="rounded" /></th>
                      <Th onClick={() => toggleContactSort("firstName")} label="First Name" sortKey={contactSort} thisKey="firstName" dir={contactDir} />
                      <Th onClick={() => toggleContactSort("lastName")} label="Last Name" sortKey={contactSort} thisKey="lastName" dir={contactDir} />
                      <Th onClick={() => toggleContactSort("company")} label="Company" sortKey={contactSort} thisKey="company" dir={contactDir} />
                      <Th onClick={() => toggleContactSort("email")} label="Email" sortKey={contactSort} thisKey="email" dir={contactDir} />
                      <th className="text-right p-3 font-medium w-16">Sent</th>
                      <th className="text-right p-3 font-medium w-16">Recv</th>
                      <th className="text-right p-3 font-medium w-16">Total</th>
                      <th className="p-3 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredContacts.length === 0 ? (
                      <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">No contacts match.</td></tr>
                    ) : filteredContacts.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE).map((c) => (
                      <tr key={c.email} className="border-t hover:bg-muted/50">
                        <td className="p-3"><input type="checkbox" checked={contactSelected.has(c.email)} onChange={() => setContactSelected((p) => { const n = new Set(p); n.has(c.email) ? n.delete(c.email) : n.add(c.email); return n; })} className="rounded" /></td>
                        <td className="p-3">{c.firstName || c.name?.split(" ")[0] || <span className="text-muted-foreground">--</span>}</td>
                        <td className="p-3">{c.lastName || c.name?.split(" ").slice(1).join(" ") || <span className="text-muted-foreground">--</span>}</td>
                        <td className="p-3">{c.company || c.domain}</td>
                        <td className="p-3 text-muted-foreground">{c.email}</td>
                        <td className="p-3 text-right text-muted-foreground">{c.sentCount}</td>
                        <td className="p-3 text-right text-muted-foreground">{c.receivedCount}</td>
                        <td className="p-3 text-right font-medium">{c.sentCount + c.receivedCount}</td>
                        <td className="p-3"><button onClick={() => excludeContact(c.email, c.id)} className="text-muted-foreground hover:text-red-500 text-xs">{"\u2715"}</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={safePage} total={Math.max(1, Math.ceil(filteredContacts.length / PAGE_SIZE))} count={filteredContacts.length} onPage={setPage} />
            </>
          )}

          {tab === "excluded" && (
            <div className="border rounded-lg overflow-hidden bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left p-3 font-medium">Type</th>
                    <th className="text-left p-3 font-medium">Name</th>
                    <th className="text-left p-3 font-medium">Details</th>
                    <th className="p-3 w-24" />
                  </tr>
                </thead>
                <tbody>
                  {totalExcluded === 0 ? (
                    <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No excluded items.</td></tr>
                  ) : (
                    <>
                      {excludedDomains.map((d) => (
                        <tr key={`d-${d.domain}`} className="border-t hover:bg-muted/50">
                          <td className="p-3"><span className="text-xs bg-muted px-2 py-0.5 rounded">Domain</span></td>
                          <td className="p-3 font-medium">{d.domain}</td>
                          <td className="p-3 text-muted-foreground">{d.totalCount} emails</td>
                          <td className="p-3">{d.id && <button onClick={() => restoreItem("domain", d.id!, d.domain)} className="text-xs text-primary hover:underline">Restore</button>}</td>
                        </tr>
                      ))}
                      {excludedContacts.map((c) => (
                        <tr key={`c-${c.email}`} className="border-t hover:bg-muted/50">
                          <td className="p-3"><span className="text-xs bg-muted px-2 py-0.5 rounded">Contact</span></td>
                          <td className="p-3 font-medium">{c.firstName || c.name || ""} {c.lastName || ""}</td>
                          <td className="p-3 text-muted-foreground">{c.email}</td>
                          <td className="p-3">{c.id && <button onClick={() => restoreItem("contact", c.id!)} className="text-xs text-primary hover:underline">Restore</button>}</td>
                        </tr>
                      ))}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );

  function toggleDomainSort(key: DomainSort) {
    if (domainSort === key) setDomainDir((d) => d === "desc" ? "asc" : "desc");
    else { setDomainSort(key); setDomainDir("desc"); }
  }
  function toggleContactSort(key: ContactSort) {
    if (contactSort === key) setContactDir((d) => d === "desc" ? "asc" : "desc");
    else { setContactSort(key); setContactDir("asc"); }
  }
}

// ── Shared components ──────────────────────────────────────────────

function Th({ onClick, label, sortKey, thisKey, dir, right }: { onClick: () => void; label: string; sortKey: string; thisKey: string; dir: SortDir; right?: boolean }) {
  const arrow = sortKey === thisKey ? (dir === "desc" ? " \u2193" : " \u2191") : "";
  return (
    <th className={`p-3 font-medium ${right ? "text-right w-20" : "text-left"}`}>
      <button onClick={onClick} className="hover:underline">{label}{arrow}</button>
    </th>
  );
}

function Pagination({ page, total, count, onPage }: { page: number; total: number; count: number; onPage: (p: number) => void }) {
  if (total <= 1) return <div className="py-2 text-xs text-muted-foreground">{count} items</div>;
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-xs text-muted-foreground">{count} items</span>
      <div className="flex items-center gap-2">
        <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1} className="px-3 py-1 border rounded text-sm hover:bg-muted disabled:opacity-30">Previous</button>
        <span className="text-sm text-muted-foreground">Page {page} of {total}</span>
        <button onClick={() => onPage(Math.min(total, page + 1))} disabled={page >= total} className="px-3 py-1 border rounded text-sm hover:bg-muted disabled:opacity-30">Next</button>
      </div>
    </div>
  );
}

function downloadCSV(rows: string[][], prefix: string) {
  const csv = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${prefix}-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
}
