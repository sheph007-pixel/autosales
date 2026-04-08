import PgBoss from "pg-boss";
import { handleSyncMailbox } from "./jobs/sync-mailbox";
import { handleClassifyMessage } from "./jobs/classify-message";
import { handleRefreshDomainMemory } from "./jobs/refresh-domain-memory";
import { handleExecuteCadenceStep } from "./jobs/execute-cadence-step";
import { handleSendEmail } from "./jobs/send-email";
import { handleProcessReply } from "./jobs/process-reply";
import { handleScheduleCadences } from "./jobs/schedule-cadences";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

// pg-boss v10 WorkHandler receives Job[] (batch). Wrap to process one at a time.
function singleJobHandler<T>(handler: (job: PgBoss.Job<T>) => Promise<void>) {
  return async (jobs: PgBoss.Job<T>[]) => {
    for (const job of jobs) {
      await handler(job);
    }
  };
}

async function main() {
  console.log("Starting AutoSales worker...");

  const boss = new PgBoss({
    connectionString: DATABASE_URL,
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
    expireInHours: 24,
    archiveCompletedAfterSeconds: 86400,
    deleteAfterDays: 7,
  });

  boss.on("error", (error: Error) => console.error("pg-boss error:", error));

  await boss.start();
  console.log("pg-boss started.");

  // Register job handlers
  await boss.work("sync-mailbox", singleJobHandler(handleSyncMailbox));
  await boss.work("classify-message", singleJobHandler(handleClassifyMessage));
  await boss.work("refresh-domain-memory", singleJobHandler(handleRefreshDomainMemory));
  await boss.work("execute-cadence-step", singleJobHandler(handleExecuteCadenceStep));
  await boss.work("send-email", singleJobHandler(handleSendEmail));
  await boss.work("process-reply", singleJobHandler(handleProcessReply));
  await boss.work("schedule-cadences", singleJobHandler(handleScheduleCadences));

  // Schedule recurring jobs
  await boss.schedule("sync-mailbox", "*/5 * * * *", {});
  await boss.schedule("schedule-cadences", "*/15 * * * *", {});

  console.log("All workers registered. Listening for jobs...");

  // Graceful shutdown
  const shutdown = async () => {
    console.log("Shutting down worker...");
    await boss.stop({ graceful: true, timeout: 30000 });
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("Worker startup failed:", err);
  process.exit(1);
});
