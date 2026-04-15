"use client";

import { useState, useEffect, useMemo, useCallback, Fragment } from "react";
import Link from "next/link";

interface ScanContact {
  email: string;
  name: string;
  sentCount: number;
  receivedCount: number;
}

interface ScanDomain {
  domain: string;
  sentCount: number;
  receivedCount: number;
  totalCount: number;
  contacts: ScanContact[];
}

interface ScanData {
  status: "idle" | "scanning" | "done" | "error";
  emailsScanned: number;
  domainsFound: number;
  folder: string;
  error?: string;
  lastScannedAt: string | null;
  results: ScanDomain[];
}

type SortKey = "domain" | "sent" | "received" | "total";
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

export function DiscoverClient() {
  const [data, setData] = useState<ScanData>({
    status: "idle",
    emailsScanned: 0,
    domainsFound: 0,
    folder: "",
    lastScannedAt: null,
    results: [],
  });
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Fetch on mount
  useEffect(() => {
    fetch("/api/discover")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  // Poll every second while scanning (live results)
  useEffect(() => {
    if (data.status !== "scanning") return;
    const id = setInterval(() => {
      fetch("/api/discover")
        .then((r) => r.json())
        .then(setData)
        .catch(() => {});
    }, 1000);
    return () => clearInterval(id);
  }, [data.status]);

  const startScan = useCallback(async () => {
    setData((s) => ({ ...s, status: "scanning", emailsScanned: 0, domainsFound: 0, folder: "", results: [] }));
    setHidden(new Set());
    setSelected(new Set());
    await fetch("/api/discover", { method: "POST" }).catch(() => {});
  }, []);

  // Filter + sort
  const filtered = useMemo(() => {
    let list = data.results.filter((g) => !hidden.has(g.domain));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (g) =>
          g.domain.includes(q) ||
          g.contacts.some((c) => c.email.includes(q) || c.name.toLowerCase().includes(q))
      );
    }
    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "domain": cmp = a.domain.localeCompare(b.domain); break;
        case "sent": cmp = a.sentCount - b.sentCount; break;
        case "received": cmp = a.receivedCount - b.receivedCount; break;
        case "total": cmp = a.totalCount - b.totalCount; break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [data.results, hidden, search, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDir === "desc" ? " \u2193" : " \u2191") : "";

  const toggleExpand = (domain: string) =>
    setExpanded((p) => { const n = new Set(p); n.has(domain) ? n.delete(domain) : n.add(domain); return n; });

  const hideDomain = (domain: string) => {
    setHidden((p) => new Set(p).add(domain));
    setSelected((p) => { const n = new Set(p); n.delete(domain); return n; });
  };

  const toggleSelect = (domain: string) =>
    setSelected((p) => { const n = new Set(p); n.has(domain) ? n.delete(domain) : n.add(domain); return n; });

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((g) => g.domain)));
  };

  const exportCSV = () => {
    const list = selected.size > 0 ? filtered.filter((g) => selected.has(g.domain)) : filtered;
    const rows: string[][] = [["Domain", "Email", "Name", "Sent", "Received", "Total"]];
    for (const d of list) {
      if (d.contacts.length === 0) {
        rows.push([d.domain, "", "", String(d.sentCount), String(d.receivedCount), String(d.totalCount)]);
      } else {
        for (const c of d.contacts) {
          rows.push([d.domain, c.email, c.name, String(c.sentCount), String(c.receivedCount), String(c.sentCount + c.receivedCount)]);
        }
      }
    }
    const csv = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `targets-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  const isScanning = data.status === "scanning";
  const hasResults = data.results.length > 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="border-b bg-card px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/groups" className="text-sm text-muted-foreground hover:text-foreground">
            &larr; Kennion
          </Link>
          <h1 className="text-lg font-bold">Discover</h1>
          {isScanning && (
            <span className="text-sm text-muted-foreground flex items-center gap-2">
              <span className="inline-block animate-spin h-3 w-3 border-2 border-primary border-t-transparent rounded-full" />
              Scanning {data.folder}...
              {" "}{data.emailsScanned.toLocaleString()} emails
              {" \u00B7 "}{data.domainsFound.toLocaleString()} domains
            </span>
          )}
          {!isScanning && data.lastScannedAt && (
            <span className="text-sm text-muted-foreground">
              Last scan: {timeAgo(data.lastScannedAt)}
              {" \u00B7 "}{data.emailsScanned.toLocaleString()} emails
              {" \u00B7 "}{data.domainsFound.toLocaleString()} domains
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {hasResults && (
            <>
              {selected.size > 0 && (
                <span className="text-xs text-muted-foreground">{selected.size} selected</span>
              )}
              <button onClick={exportCSV} className="px-3 py-1.5 border rounded text-sm hover:bg-muted">
                Export CSV
              </button>
              {hidden.size > 0 && (
                <button onClick={() => setHidden(new Set())} className="text-xs text-muted-foreground hover:text-foreground">
                  Show {hidden.size} hidden
                </button>
              )}
            </>
          )}
          <button
            onClick={startScan}
            disabled={isScanning}
            className={`px-4 py-1.5 rounded text-sm font-medium ${
              isScanning
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            {isScanning ? "Scanning..." : hasResults ? "Re-scan" : "Scan Mailbox"}
          </button>
        </div>
      </div>

      {/* Error */}
      {data.status === "error" && (
        <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
          {data.error}
        </div>
      )}

      {/* Empty state — only if no results AND not scanning */}
      {!hasResults && !isScanning && data.status !== "error" && (
        <div className="flex items-center justify-center" style={{ height: "calc(100vh - 60px)" }}>
          <div className="text-center">
            <p className="text-muted-foreground mb-4">
              Scan your Outlook mailbox to discover which companies you email most.
            </p>
            <button
              onClick={startScan}
              className="px-6 py-2 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90"
            >
              Scan Mailbox
            </button>
          </div>
        </div>
      )}

      {/* Table — shows even during scan as results stream in */}
      {hasResults && (
        <div className="px-6 pt-3 pb-6">
          {/* Search */}
          <div className="mb-3">
            <input
              type="text"
              placeholder="Search domains or contacts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-3 py-1.5 border rounded text-sm bg-background w-72"
            />
          </div>

          {/* Table */}
          <div className="border rounded-lg overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-3 w-10">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && selected.size === filtered.length}
                      onChange={toggleSelectAll}
                      className="rounded"
                    />
                  </th>
                  <th className="text-left p-3 font-medium">
                    <button onClick={() => toggleSort("domain")} className="hover:underline">
                      Domain{arrow("domain")}
                    </button>
                  </th>
                  <th className="text-right p-3 font-medium w-20">
                    <button onClick={() => toggleSort("sent")} className="hover:underline">
                      Sent{arrow("sent")}
                    </button>
                  </th>
                  <th className="text-right p-3 font-medium w-20">
                    <button onClick={() => toggleSort("received")} className="hover:underline">
                      Recv{arrow("received")}
                    </button>
                  </th>
                  <th className="text-right p-3 font-medium w-20">
                    <button onClick={() => toggleSort("total")} className="hover:underline">
                      Total{arrow("total")}
                    </button>
                  </th>
                  <th className="p-3 w-16" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      No domains match your search.
                    </td>
                  </tr>
                ) : (
                  filtered.map((group) => {
                    const isExp = expanded.has(group.domain);
                    return (
                      <Fragment key={group.domain}>
                        <tr className="border-t hover:bg-muted/50">
                          <td className="p-3">
                            <input
                              type="checkbox"
                              checked={selected.has(group.domain)}
                              onChange={() => toggleSelect(group.domain)}
                              className="rounded"
                            />
                          </td>
                          <td
                            className="p-3 font-medium cursor-pointer"
                            onClick={() => toggleExpand(group.domain)}
                          >
                            {group.domain}
                            <span className="text-xs text-muted-foreground ml-2">
                              {group.contacts.length}
                            </span>
                          </td>
                          <td className="p-3 text-right text-muted-foreground">{group.sentCount}</td>
                          <td className="p-3 text-right text-muted-foreground">{group.receivedCount}</td>
                          <td className="p-3 text-right font-medium">{group.totalCount}</td>
                          <td className="p-3">
                            <div className="flex items-center gap-1">
                              {group.contacts.length > 0 && (
                                <button
                                  onClick={() => toggleExpand(group.domain)}
                                  className="text-muted-foreground hover:text-foreground text-xs"
                                >
                                  {isExp ? "\u25BC" : "\u25B6"}
                                </button>
                              )}
                              <button
                                onClick={() => hideDomain(group.domain)}
                                className="text-muted-foreground hover:text-red-500 text-xs ml-1"
                                title="Hide"
                              >
                                {"\u2715"}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExp &&
                          group.contacts.map((c) => (
                            <tr key={c.email} className="bg-muted/30">
                              <td className="p-3" />
                              <td className="p-3 pl-8">
                                <span className="text-sm">{c.name}</span>
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
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
