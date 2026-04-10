import type PgBoss from "pg-boss";
import { db, cadences, companies, contacts, enrollments, auditLogs } from "@autosales/db";
import { eq, and, lte, sql, gte, desc, notInArray, inArray, isNull } from "drizzle-orm";
import { getDueEnrollments } from "@autosales/core/services/cadence.service";
import { addDays } from "@autosales/core/utils/date-utils";

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

/**
 * Campaign automation tick. Runs on a schedule.
 *
 * For each active campaign:
 *  1. Enroll eligible groups that match `allowed_statuses` and `filter_json`
 *     but aren't already enrolled in an active state.
 *  2. Respect daily_limit — skip enrollments if today's send count is already
 *     at the limit for this campaign.
 *
 * Then, queue every due enrollment as an execute-cadence-step job.
 */
export function makeScheduleCadencesHandler(boss: PgBoss) {
  return async function handleScheduleCadences(_job: PgBoss.Job) {
    console.log("[scheduler] tick");

    // 1. Enroll eligible groups in each active campaign
    const activeCampaigns = await db.select().from(cadences).where(eq(cadences.isActive, true));
    console.log(`[scheduler] ${activeCampaigns.length} active campaigns`);

    for (const campaign of activeCampaigns) {
      try {
        const allowedStatuses = Array.isArray(campaign.allowedStatuses)
          ? (campaign.allowedStatuses as string[])
          : [];
        if (allowedStatuses.length === 0) continue;

        // Daily limit gate: count sends logged today for this campaign
        if (campaign.dailyLimit && campaign.dailyLimit > 0) {
          const sinceMidnight = new Date();
          sinceMidnight.setHours(0, 0, 0, 0);
          const [{ c: sentToday = 0 } = { c: 0 }] = (await db
            .select({ c: sql<number>`count(*)::int` })
            .from(auditLogs)
            .where(
              and(
                eq(auditLogs.action, "cadence_step_executed"),
                gte(auditLogs.createdAt, sinceMidnight)
              )
            )) as Array<{ c: number }>;
          if (Number(sentToday) >= campaign.dailyLimit) {
            console.log(
              `[scheduler] campaign ${campaign.name} reached daily_limit ${campaign.dailyLimit}, skipping enrollment`
            );
            continue;
          }
        }

        // Filter criteria
        const filter = (campaign.filterJson ?? {}) as Record<string, unknown>;
        const renewalWithinDays =
          typeof filter.renewalWithinDays === "number" ? (filter.renewalWithinDays as number) : null;
        const noReplyDays =
          typeof filter.noReplyDays === "number" ? (filter.noReplyDays as number) : null;

        // Pull candidate companies: allowed status, not DNC
        const candidates = await db
          .select()
          .from(companies)
          .where(
            and(
              inArray(companies.status, allowedStatuses),
              eq(companies.doNotContact, false)
            )
          )
          .limit(200);

        // Post-filter in JS for renewal window + no-reply window (keeps SQL simple)
        const eligible = candidates.filter((c) => {
          if (renewalWithinDays !== null && c.renewalMonth !== null) {
            const nowMonth = new Date().getMonth() + 1;
            let diff = c.renewalMonth - nowMonth;
            if (diff < 0) diff += 12;
            const days = diff * 30; // rough
            if (days > renewalWithinDays) return false;
          }
          if (noReplyDays !== null && c.lastActivityAt) {
            if (c.lastActivityAt > daysAgo(noReplyDays)) return false;
          }
          return true;
        });

        if (eligible.length === 0) continue;

        // Find which are already enrolled (active) in this campaign
        const eligibleIds = eligible.map((c) => c.id);
        const alreadyEnrolled = await db
          .select({ companyId: enrollments.companyId })
          .from(enrollments)
          .where(
            and(
              eq(enrollments.cadenceId, campaign.id),
              inArray(enrollments.companyId, eligibleIds),
              inArray(enrollments.status, ["active", "replied", "completed"])
            )
          );
        const enrolledSet = new Set(alreadyEnrolled.map((e) => e.companyId));
        const toEnroll = eligible.filter((c) => !enrolledSet.has(c.id));

        // Enroll — pick primary contact, or fall back to any contact
        for (const company of toEnroll.slice(0, 25)) {
          let contactId = company.primaryContactId;
          if (!contactId) {
            const [firstContact] = await db
              .select()
              .from(contacts)
              .where(eq(contacts.companyId, company.id))
              .orderBy(contacts.createdAt)
              .limit(1);
            if (!firstContact) continue;
            contactId = firstContact.id;
          }

          await db.insert(enrollments).values({
            cadenceId: campaign.id,
            companyId: company.id,
            contactId,
            currentStep: 1,
            status: "active",
            nextStepAt: new Date(), // due immediately
          });
          console.log(
            `[scheduler] enrolled ${company.companyName ?? company.domain} in campaign ${campaign.name}`
          );
        }

        // Mark campaign last_run_at
        await db
          .update(cadences)
          .set({ lastRunAt: new Date() })
          .where(eq(cadences.id, campaign.id));
      } catch (err) {
        console.error(`[scheduler] failed for campaign ${campaign.id}:`, err);
      }
    }

    // 2. Queue due enrollments for execution
    const dueEnrollments = await getDueEnrollments(50);
    if (dueEnrollments.length === 0) {
      console.log("[scheduler] no due enrollments");
      return;
    }

    console.log(`[scheduler] queueing ${dueEnrollments.length} due enrollments`);
    for (const enrollment of dueEnrollments) {
      await boss.send("execute-cadence-step", { enrollmentId: enrollment.id });
    }
  };
}
