"use client";

import { useState } from "react";

export function OutlookConnect({
  connected,
  email,
  lastSynced,
}: {
  connected: boolean;
  email: string | null;
  lastSynced: string | null;
}) {
  const [syncing, setSyncing] = useState(false);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync/trigger", { method: "POST" });
      if (!res.ok) {
        alert("Sync failed. Check console for details.");
      }
    } finally {
      setSyncing(false);
    }
  }

  if (!connected) {
    return (
      <div>
        <p className="text-sm text-muted-foreground mb-4">
          Connect your Outlook account to sync emails, discover domains, and enable automated outreach.
        </p>
        <a
          href="/api/outlook/connect"
          className="inline-block py-2 px-4 bg-primary text-primary-foreground rounded text-sm font-medium hover:opacity-90"
        >
          Connect Outlook
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 bg-green-500 rounded-full" />
        <span className="text-sm font-medium">Connected</span>
      </div>
      <div className="text-sm text-muted-foreground">
        <p>Account: {email}</p>
        <p>Last synced: {lastSynced ? new Date(lastSynced).toLocaleString() : "Never"}</p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleSync}
          disabled={syncing}
          className="py-2 px-4 bg-primary text-primary-foreground rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {syncing ? "Syncing..." : "Sync Now"}
        </button>
        <a
          href="/api/outlook/connect"
          className="py-2 px-4 border rounded text-sm font-medium hover:bg-muted"
        >
          Reconnect
        </a>
      </div>
    </div>
  );
}
