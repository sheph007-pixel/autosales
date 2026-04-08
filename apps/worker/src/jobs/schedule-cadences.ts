import type PgBoss from "pg-boss";
import { getDueEnrollments } from "@autosales/core/services/cadence.service";

export async function handleScheduleCadences(job: PgBoss.Job) {
  console.log("Checking for due cadence enrollments...");

  const dueEnrollments = await getDueEnrollments(50);

  if (dueEnrollments.length === 0) {
    console.log("No due enrollments found.");
    return;
  }

  console.log(`Found ${dueEnrollments.length} due enrollments.`);

  // In production, each enrollment would be queued as a separate execute-cadence-step job.
  // This is the cron-like scheduler that feeds the execution queue.
  for (const enrollment of dueEnrollments) {
    console.log(`Queueing execution for enrollment ${enrollment.id} (step ${enrollment.currentStep})`);
    // Note: In actual production, we'd call boss.send('execute-cadence-step', { enrollmentId: enrollment.id })
    // For now, we log it. The pg-boss instance needs to be passed in or accessed globally for this.
  }
}
