"use client";

import { useEffect, useState } from "react";

interface SyncStatus {
  connected: boolean;
  email: string | null;
  lastSyncedAt: string | null;
  tokenExpiresAt: string | null;
  hasRefreshToken: boolean;
  messages: { total: number; matched: number; unmatched: number };
  lastSyncResult: {
    at: string;
    fetched: number;
    stored: number;
    duplicates: number;
    matched: number;
    unmatched: number;
    error?: string;
  } | null;
}

export function SyncStatusPanel() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15_000); // refresh every 15s
    return () => clearInterval(interval);
  }, []);

  function fetchStatus() {
    fetch("/api/sync/status")
      .then((r) => r.json())
      .then((d) => { setStatus(d); setError(null); })
      .catch((e) => setError(e.message));
  }

  if (error) return <p className="text-xs text-red-600">Failed to load status: {error}</p>;
  if (!status) return <p className="text-xs text-muted-foreground">Loading...</p>;

  const tokenOk = status.tokenExpiresAt && new Date(status.tokenExpiresAt) > new Date();

  return (
    <div className="space-y-3 text-sm">
      {/* Connection */}
      <div className="flex justify-between">
        <span className="text-muted-foreground">Status</span>
        <span className={status.connected ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
          {status.connected ? "Connected" : "Disconnected"}
        </span>
      </div>
      {status.email && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Mailbox</span>
          <span>{status.email}</span>
        </div>
      )}
      <div className="flex justify-between">
        <span className="text-muted-foreground">Refresh Token</span>
        <span className={status.hasRefreshToken ? "text-green-600" : "text-red-600"}>
          {status.hasRefreshToken ? "Valid" : "Missing"}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Access Token</span>
        <span className={tokenOk ? "text-green-600" : "text-amber-600"}>
          {tokenOk ? "Active" : "Expired (will auto-refresh)"}
        </span>
      </div>

      {/* Sync timing */}
      <div className="flex justify-between">
        <span className="text-muted-foreground">Last Sync</span>
        <span>{status.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleString() : "Never"}</span>
      </div>

      {/* Message counts */}
      <div className="border-t pt-3 mt-3 space-y-2">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total Messages</span>
          <span className="font-medium">{status.messages.total}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Matched to Groups</span>
          <span className="text-green-600">{status.messages.matched}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Unmatched</span>
          <span className="text-amber-600">{status.messages.unmatched}</span>
        </div>
      </div>

      {/* Last sync result */}
      {status.lastSyncResult && (
        <div className="border-t pt-3 mt-3">
          <p className="text-xs text-muted-foreground mb-1">Last sync run:</p>
          <p className="text-xs font-mono">
            fetched {status.lastSyncResult.fetched}, stored {status.lastSyncResult.stored},
            dupes {status.lastSyncResult.duplicates}, matched {status.lastSyncResult.matched}
            {status.lastSyncResult.error && <span className="text-red-600"> — {status.lastSyncResult.error}</span>}
          </p>
        </div>
      )}
    </div>
  );
}
