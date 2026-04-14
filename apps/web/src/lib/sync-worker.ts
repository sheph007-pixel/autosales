import { ensureTables } from "@autosales/db";
import { runMailboxSync } from "./sync";

const SYNC_INTERVAL_MS = 90_000; // 90 seconds

let started = false;

/**
 * Starts a background sync loop that runs every 90 seconds.
 * Called once from instrumentation.ts on server startup.
 */
export function startSyncLoop() {
  if (started) return;
  started = true;

  console.log("[sync-worker] background sync loop starting (every 90s)");

  // First sync after 5 seconds (let server finish booting)
  setTimeout(async () => {
    await runSyncSafe();
    // Then repeat every 90 seconds
    setInterval(runSyncSafe, SYNC_INTERVAL_MS);
  }, 5_000);
}

async function runSyncSafe() {
  try {
    await ensureTables();
    const result = await runMailboxSync();
    if (result.error && result.error !== "sync_in_progress") {
      console.error("[sync-worker] error:", result.error);
    }
  } catch (err) {
    console.error("[sync-worker] unexpected error:", err);
  }
}
