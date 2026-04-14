export async function register() {
  // Only start the sync loop on the Node.js server runtime, not during build or on Edge
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startSyncLoop } = await import("./lib/sync-worker");
    startSyncLoop();
  }
}
