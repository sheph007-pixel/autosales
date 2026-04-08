import { eq, and, lte, desc } from "drizzle-orm";
import { db, tasks } from "@autosales/db";
import type { Task, NewTask } from "@autosales/db";

export async function createTask(data: {
  companyId: string;
  contactId?: string;
  type: string;
  description: string;
  dueAt?: Date;
  metadata?: Record<string, unknown>;
}): Promise<Task> {
  const [task] = await db
    .insert(tasks)
    .values({
      companyId: data.companyId,
      contactId: data.contactId ?? null,
      type: data.type,
      description: data.description,
      dueAt: data.dueAt ?? new Date(),
      metadata: data.metadata ?? {},
    })
    .returning();
  return task!;
}

export async function getPendingTasks(limit: number = 50) {
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.status, "pending"))
    .orderBy(tasks.dueAt)
    .limit(limit);
}

export async function getDueTasks(limit: number = 50) {
  return db
    .select()
    .from(tasks)
    .where(and(eq(tasks.status, "pending"), lte(tasks.dueAt, new Date())))
    .orderBy(tasks.dueAt)
    .limit(limit);
}

export async function completeTask(taskId: string) {
  const [updated] = await db
    .update(tasks)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(tasks.id, taskId))
    .returning();
  return updated;
}

export async function getCompanyTasks(companyId: string) {
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.companyId, companyId))
    .orderBy(desc(tasks.createdAt))
    .limit(20);
}
