"use client";

import { useEffect } from "react";

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let lastSyncTriggered = 0;

/**
 * Fires a background sync request on mount if enough time has elapsed.
 * Rendered once in the app layout — no UI, just a side-effect.
 */
export function AutoSync() {
  useEffect(() => {
    const now = Date.now();
    if (now - lastSyncTriggered < SYNC_INTERVAL_MS) return;
    lastSyncTriggered = now;

    fetch("/api/sync/trigger", { method: "POST" }).catch(() => {
      // Silently ignore — sync is best-effort
    });
  }, []);

  return null;
}
