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
  const [syncResult, setSyncResult] = useState<string | null>(null);

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/sync/trigger", { method: "POST" });
      if (res.ok) {
        setSyncResult("Sync triggered. The worker will process it shortly.");
      } else {
        setSyncResult("Sync trigger failed. Check logs.");
      }
    } catch {
      setSyncResult("Network error.");
    } finally {
      setSyncing(false);
    }
  }

  if (!connected) {
    return (
      <div>
        <p className="text-sm text-muted-foreground mb-4">
          Outlook mailbox is not connected yet. Sign out and sign back in to connect your mailbox.
        </p>
        <a
          href="/api/auth/login"
          className="inline-block py-2 px-4 bg-primary text-primary-foreground rounded text-sm font-medium hover:opacity-90"
        >
          Reconnect Microsoft Account
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
        <p>Mailbox: {email}</p>
        <p>Last synced: {lastSynced ? new Date(lastSynced).toLocaleString() : "Never"}</p>
      </div>
      <button
        onClick={handleSync}
        disabled={syncing}
        className="py-2 px-4 bg-primary text-primary-foreground rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {syncing ? "Syncing..." : "Sync Now"}
      </button>
      {syncResult && (
        <p className="text-xs text-muted-foreground">{syncResult}</p>
      )}
    </div>
  );
}
