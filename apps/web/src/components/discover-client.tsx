"use client";

import { useState, useEffect, useMemo, useCallback, Fragment } from "react";

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

interface ScanState {
  status: "idle" | "scanning" | "done" | "error";
  emailsScanned: number;
  domainsFound: number;
  folder: string;
  error?: string;
  results: ScanDomain[];
}

type SortKey = "domain" | "sent" | "received" | "total";
type SortDir = "asc" | "desc";

export function DiscoverClient() {
  const [state, setState] = useState<ScanState>({
    status: "idle",
    emailsScanned: 0,
    domainsFound: 0,
    folder: "",
    results: [],
  });
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Fetch initial state on mount
  useEffect(() => {
    fetch("/api/discover")
      .then((r) => r.json())
      .then(setState)
      .catch(() => {});
  }, []);

  // Poll every second while scanning
  useEffect(() => {
    if (state.status !== "scanning") return;
    const id = setInterval(() => {
      fetch("/api/discover")
        .then((r) => r.json())
        .then(setState)
        .catch(() => {});
    }, 1000);
    return () => clearInterval(id);
  }, [state.status]);

  const startScan = useCallback(async () => {
    setState((s) => ({
      ...s,
      status: "scanning",
      emailsScanned: 0,
      domainsFound: 0,
      folder: "",
    }));
    await fetch("/api/discover", { method: "POST" }).catch(() => {});
  }, []);

  // Filter + sort
  const filtered = useMemo(() => {
    let list = state.results.filter((g) => !hidden.has(g.domain));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (g) =>
          g.domain.includes(q) ||
          g.contacts.some(
            (c) => c.email.includes(q) || c.name.toLowerCase().includes(q)
          )
      );
    }
    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "domain":
          cmp = a.domain.localeCompare(b.domain);
          break;
        case "sent":
          cmp = a.sentCount - b.sentCount;
          break;
        case "received":
          cmp = a.receivedCount - b.receivedCount;
          break;
        case "total":
          cmp = a.totalCount - b.totalCount;
          break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [state.results, hidden, search, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDir === "desc" ? " \u2193" : " \u2191") : "";

  const toggleExpand = (domain: string) =>
    setExpanded((p) => {
      const n = new Set(p);
      n.has(domain) ? n.delete(domain) : n.add(domain);
      return n;
    });

  const hideDomain = (domain: string) => {
    setHidden((p) => new Set(p).add(domain));
    setSelected((p) => {
      const n = new Set(p);
      n.delete(domain);
      return n;
    });
  };

  const toggleSelect = (domain: string) =>
    setSelected((p) => {
      const n = new Set(p);
      n.has(domain) ? n.delete(domain) : n.add(domain);
      return n;
    });

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((g) => g.domain)));
  };

  const exportCSV = () => {
    const list =
      selected.size > 0
        ? filtered.filter((g) => selected.has(g.domain))
        : filtered;
    const rows: string[][] = [
      ["Domain", "Email", "Name", "Sent", "Received", "Total"],
    ];
    for (const d of list) {
      if (d.contacts.length === 0) {
        rows.push([
          d.domain,
          "",
          "",
          String(d.sentCount),
          String(d.receivedCount),
          String(d.totalCount),
        ]);
      } else {
        for (const c of d.contacts) {
          rows.push([
            d.domain,
            c.email,
            c.name,
            String(c.sentCount),
            String(c.receivedCount),
            String(c.sentCount + c.receivedCount),
          ]);
        }
      }
    }
    const csv = rows
      .map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `targets-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  const isScanning = state.status === "scanning";
  const hasResults = state.results.length > 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Discover</h1>
          {hasResults && !isScanning && (
            <p className="text-sm text-muted-foreground">
              {state.domainsFound.toLocaleString()} domains from{" "}
              {state.emailsScanned.toLocaleString()} emails
            </p>
          )}
        </div>
        <button
          onClick={startScan}
          disabled={isScanning}
          className={`px-4 py-2 rounded text-sm font-medium ${
            isScanning
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          }`}
        >
          {isScanning ? "Scanning..." : hasResults ? "Re-scan" : "Scan Mailbox"}
        </button>
      </div>

      {/* Scanning progress */}
      {isScanning && (
        <div className="mb-4 p-4 border rounded bg-muted/50">
          <div className="flex items-center gap-3">
            <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
            <div>
              <p className="text-sm font-medium">
                Scanning {state.folder || "mailbox"}...
              </p>
              <p className="text-xs text-muted-foreground">
                {state.emailsScanned.toLocaleString()} emails scanned
                {" \u00B7 "}
                {state.domainsFound.toLocaleString()} domains found
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {state.status === "error" && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
          {state.error}
        </div>
      )}

      {/* Empty state */}
      {!hasResults && !isScanning && state.status !== "error" && (
        <div className="p-12 text-center border rounded bg-card">
          <p className="text-muted-foreground mb-4">
            Scan your Outlook mailbox to discover which companies you email
            most.
          </p>
          <button
            onClick={startScan}
            className="px-6 py-2 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90"
          >
            Scan Mailbox
          </button>
        </div>
      )}

      {/* Results table */}
      {hasResults && (
        <>
          <div className="flex items-center justify-between mb-3">
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-3 py-1.5 border rounded text-sm bg-background w-64"
            />
            <div className="flex items-center gap-2">
              {selected.size > 0 && (
                <span className="text-xs text-muted-foreground">
                  {selected.size} selected
                </span>
              )}
              <button
                onClick={exportCSV}
                className="px-3 py-1.5 border rounded text-sm hover:bg-muted"
              >
                Export CSV
              </button>
              {hidden.size > 0 && (
                <button
                  onClick={() => setHidden(new Set())}
                  className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  Show {hidden.size} hidden
                </button>
              )}
            </div>
          </div>

          <div className="bg-card border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-3 w-10">
                    <input
                      type="checkbox"
                      checked={
                        filtered.length > 0 &&
                        selected.size === filtered.length
                      }
                      onChange={toggleSelectAll}
                      className="rounded"
                    />
                  </th>
                  <th className="text-left p-3 font-medium">
                    <button
                      onClick={() => toggleSort("domain")}
                      className="hover:underline"
                    >
                      Domain{arrow("domain")}
                    </button>
                  </th>
                  <th className="text-right p-3 font-medium w-20">
                    <button
                      onClick={() => toggleSort("sent")}
                      className="hover:underline"
                    >
                      Sent{arrow("sent")}
                    </button>
                  </th>
                  <th className="text-right p-3 font-medium w-20">
                    <button
                      onClick={() => toggleSort("received")}
                      className="hover:underline"
                    >
                      Recv{arrow("received")}
                    </button>
                  </th>
                  <th className="text-right p-3 font-medium w-20">
                    <button
                      onClick={() => toggleSort("total")}
                      className="hover:underline"
                    >
                      Total{arrow("total")}
                    </button>
                  </th>
                  <th className="p-3 w-16" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="p-8 text-center text-muted-foreground"
                    >
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
                              {group.contacts.length} contacts
                            </span>
                          </td>
                          <td className="p-3 text-right text-muted-foreground">
                            {group.sentCount}
                          </td>
                          <td className="p-3 text-right text-muted-foreground">
                            {group.receivedCount}
                          </td>
                          <td className="p-3 text-right font-medium">
                            {group.totalCount}
                          </td>
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
                                title="Hide domain"
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
                                <div className="text-sm">{c.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {c.email}
                                </div>
                              </td>
                              <td className="p-3 text-right text-muted-foreground text-xs">
                                {c.sentCount}
                              </td>
                              <td className="p-3 text-right text-muted-foreground text-xs">
                                {c.receivedCount}
                              </td>
                              <td className="p-3 text-right text-xs">
                                {c.sentCount + c.receivedCount}
                              </td>
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
        </>
      )}
    </div>
  );
}
