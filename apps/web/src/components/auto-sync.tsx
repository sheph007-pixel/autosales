"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let lastSyncTriggered = 0;

/**
 * Fires a background sync on mount (with 5-min cooldown).
 * Shows a small status indicator when syncing.
 * Auto-refreshes the page data when sync completes with new emails.
 */
export function AutoSync() {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const running = useRef(false);

  useEffect(() => {
    const now = Date.now();
    if (now - lastSyncTriggered < SYNC_INTERVAL_MS) return;
    if (running.current) return;

    lastSyncTriggered = now;
    running.current = true;
    setStatus("Syncing mailbox...");

    fetch("/api/sync/trigger", { method: "POST" })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          console.warn("[auto-sync] error:", data.error);
          setStatus(null);
        } else if (data.processed > 0) {
          setStatus(`Synced ${data.processed} new emails`);
          router.refresh();
          setTimeout(() => setStatus(null), 4000);
        } else {
          setStatus(null);
        }
      })
      .catch(() => setStatus(null))
      .finally(() => { running.current = false; });
  }, [router]);

  if (!status) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-card border rounded-lg shadow-lg px-4 py-2 text-xs text-muted-foreground z-50">
      {status}
    </div>
  );
}
