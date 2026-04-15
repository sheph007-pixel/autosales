"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/components/ui/utils";

interface DomainContact {
  email: string;
  name: string;
  sentCount: number;
  receivedCount: number;
}

interface DomainGroup {
  domain: string;
  isPersonal: boolean;
  sentCount: number;
  receivedCount: number;
  totalCount: number;
  contacts: DomainContact[];
}

type SortKey = "domain" | "sent" | "received" | "total";
type SortDir = "asc" | "desc";

interface DiscoverClientProps {
  groups: DomainGroup[];
  totalEmails: number;
}

export function DiscoverClient({ groups, totalEmails }: DiscoverClientProps) {
  const router = useRouter();
  const [hidePersonal, setHidePersonal] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<string | null>(null);

  // Filter and sort
  const filtered = useMemo(() => {
    let list = groups.filter((g) => !hidden.has(g.domain));
    if (hidePersonal) list = list.filter((g) => !g.isPersonal);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (g) =>
          g.domain.includes(q) ||
          g.contacts.some((c) => c.email.includes(q) || c.name.toLowerCase().includes(q))
      );
    }
    list.sort((a, b) => {
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
    return list;
  }, [groups, hidden, hidePersonal, search, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return "";
    return sortDir === "desc" ? " \u2193" : " \u2191";
  };

  const toggleSelect = (domain: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((g) => g.domain)));
    }
  };

  const toggleExpand = (domain: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  };

  const removeSelected = () => {
    setHidden((prev) => {
      const next = new Set(prev);
      for (const d of selected) next.add(d);
      return next;
    });
    setSelected(new Set());
  };

  const exportCSV = () => {
    const domains = selected.size > 0
      ? filtered.filter((g) => selected.has(g.domain))
      : filtered;

    const rows: string[][] = [["Domain", "Contact Email", "Contact Name", "Sent", "Received", "Total"]];
    for (const d of domains) {
      if (d.contacts.length === 0) {
        rows.push([d.domain, "", "", String(d.sentCount), String(d.receivedCount), String(d.totalCount)]);
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

    const csv = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `email-domains-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const rescan = async () => {
    setScanning(true);
    setScanStatus("Triggering sync...");
    try {
      const triggerRes = await fetch("/api/sync/trigger", { method: "POST" });
      if (!triggerRes.ok) {
        setScanStatus("Failed to trigger sync");
        setScanning(false);
        return;
      }

      // Poll status
      let done = false;
      let attempts = 0;
      while (!done && attempts < 60) {
        await new Promise((r) => setTimeout(r, 2000));
        attempts++;
        try {
          const statusRes = await fetch("/api/sync/status");
          if (statusRes.ok) {
            const data = await statusRes.json();
            if (data.syncing) {
              setScanStatus(`Scanning... (${data.fetched ?? 0} emails fetched)`);
            } else {
              done = true;
              setScanStatus(
                data.lastSync
                  ? `Done! ${data.lastSync.fetched ?? 0} fetched, ${data.lastSync.stored ?? 0} new`
                  : "Sync complete"
              );
            }
          }
        } catch {
          // Retry on network error
        }
      }

      // Refresh page data
      router.refresh();
      setTimeout(() => {
        setScanStatus(null);
        setScanning(false);
      }, 3000);
    } catch (err) {
      setScanStatus("Sync failed");
      setScanning(false);
    }
  };

  const selectedCount = selected.size;
  const allSelected = filtered.length > 0 && selected.size === filtered.length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div>
          <h1 className="text-2xl font-bold">Discover</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} domains from {totalEmails.toLocaleString()} emails
          </p>
        </div>
        <button
          onClick={rescan}
          disabled={scanning}
          className={cn(
            "px-4 py-2 rounded text-sm font-medium",
            scanning
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          {scanning ? "Scanning..." : "Re-scan Mailbox"}
        </button>
      </div>

      {scanStatus && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
          {scanStatus}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-between mb-4 mt-4">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={hidePersonal}
              onChange={(e) => setHidePersonal(e.target.checked)}
              className="rounded"
            />
            Hide personal domains
          </label>
          <input
            type="text"
            placeholder="Search domains or contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-1.5 border rounded text-sm bg-background w-64"
          />
        </div>
        <div className="flex items-center gap-2">
          {selectedCount > 0 && (
            <span className="text-sm text-muted-foreground">{selectedCount} selected</span>
          )}
          <button
            onClick={exportCSV}
            className="px-3 py-1.5 border rounded text-sm hover:bg-muted"
          >
            Export CSV{selectedCount > 0 ? ` (${selectedCount})` : ""}
          </button>
          {selectedCount > 0 && (
            <button
              onClick={removeSelected}
              className="px-3 py-1.5 border border-red-200 text-red-600 rounded text-sm hover:bg-red-50"
            >
              Remove
            </button>
          )}
          {hidden.size > 0 && (
            <button
              onClick={() => setHidden(new Set())}
              className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              Restore {hidden.size} hidden
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-3 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="rounded"
                />
              </th>
              <th className="text-left p-3 font-medium">
                <button onClick={() => toggleSort("domain")} className="hover:underline">
                  Domain{sortIcon("domain")}
                </button>
              </th>
              <th className="text-right p-3 font-medium w-24">
                <button onClick={() => toggleSort("sent")} className="hover:underline">
                  Sent{sortIcon("sent")}
                </button>
              </th>
              <th className="text-right p-3 font-medium w-24">
                <button onClick={() => toggleSort("received")} className="hover:underline">
                  Received{sortIcon("received")}
                </button>
              </th>
              <th className="text-right p-3 font-medium w-24">
                <button onClick={() => toggleSort("total")} className="hover:underline">
                  Total{sortIcon("total")}
                </button>
              </th>
              <th className="p-3 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  {groups.length === 0
                    ? "No emails found. Click \"Re-scan Mailbox\" to sync your inbox."
                    : "No domains match your filters."}
                </td>
              </tr>
            ) : (
              filtered.map((group) => (
                <DomainRow
                  key={group.domain}
                  group={group}
                  isSelected={selected.has(group.domain)}
                  isExpanded={expanded.has(group.domain)}
                  onToggleSelect={() => toggleSelect(group.domain)}
                  onToggleExpand={() => toggleExpand(group.domain)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DomainRow({
  group,
  isSelected,
  isExpanded,
  onToggleSelect,
  onToggleExpand,
}: {
  group: DomainGroup;
  isSelected: boolean;
  isExpanded: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
}) {
  return (
    <>
      <tr className="border-t hover:bg-muted/50">
        <td className="p-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            className="rounded"
          />
        </td>
        <td className="p-3 font-medium">{group.domain}</td>
        <td className="p-3 text-right text-muted-foreground">{group.sentCount}</td>
        <td className="p-3 text-right text-muted-foreground">{group.receivedCount}</td>
        <td className="p-3 text-right font-medium">{group.totalCount}</td>
        <td className="p-3">
          {group.contacts.length > 0 && (
            <button
              onClick={onToggleExpand}
              className="text-muted-foreground hover:text-foreground text-xs"
              title={isExpanded ? "Collapse" : "Expand contacts"}
            >
              {isExpanded ? "\u25BC" : "\u25B6"}
            </button>
          )}
        </td>
      </tr>
      {isExpanded &&
        group.contacts.map((contact) => (
          <tr key={contact.email} className="bg-muted/30">
            <td className="p-3"></td>
            <td className="p-3 pl-8 text-sm">
              <div>{contact.name}</div>
              <div className="text-xs text-muted-foreground">{contact.email}</div>
            </td>
            <td className="p-3 text-right text-muted-foreground text-xs">{contact.sentCount}</td>
            <td className="p-3 text-right text-muted-foreground text-xs">{contact.receivedCount}</td>
            <td className="p-3 text-right text-xs">{contact.sentCount + contact.receivedCount}</td>
            <td className="p-3"></td>
          </tr>
        ))}
    </>
  );
}
