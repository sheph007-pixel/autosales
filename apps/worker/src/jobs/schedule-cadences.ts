import type PgBoss from "pg-boss";
import { db, cadences, enrollments, auditLogs } from "@autosales/db";
import { eq, and, sql, gte, inArray, desc } from "drizzle-orm";
import { getDueEnrollments } from "@autosales/core/services/cadence.service";
import {
  resolveEligibleGroups,
  type CampaignFilter,
} from "@autosales/core/services/campaign-targeting.service";

const MAX_ENROLLMENTS_PER_CAMPAIGN_PER_TICK = 25;

/**
 * Campaign automation tick. Runs every 15 minutes via pg-boss cron.
 *
 * For each ACTIVE campaign:
 *  1. Enforce sending limits (daily, hourly, minimum_delay_seconds). All
 *     limits are scoped PER CAMPAIGN via audit_logs.entity_id. If any limit
 *     is hit, skip enrollment for this campaign this tick.
 *  2. Compute eligible groups via the shared `resolveEligibleGroups`
 *     helper (same logic used by the preview action).
 *  3. Enroll new groups that aren't already in this campaign with an
 *     active/replied/completed status. Cap at
 *     MAX_ENROLLMENTS_PER_CAMPAIGN_PER_TICK per tick.
 *  4. Update `cadences.last_run_at`.
 *
 * Then, queue every due enrollment as an execute-cadence-step job.
 */
export function makeScheduleCadencesHandler(boss: PgBoss) {
  return async function handleScheduleCadences(_job: PgBoss.Job) {
    console.log("[scheduler] tick");

    // 1. Load active campaigns only
    const activeCampaigns = await db
      .select()
      .from(cadences)
      .where(eq(cadences.isActive, true));

    console.log(`[scheduler] ${activeCampaigns.length} active campaigns`);

    for (const campaign of activeCampaigns) {
      try {
        // ---- LIMIT ENFORCEMENT (per-campaign) ----

        // Daily limit
        if (campaign.dailyLimit && campaign.dailyLimit > 0) {
          const sinceMidnight = new Date();
          sinceMidnight.setHours(0, 0, 0, 0);
          const dailyCount = await countCampaignSends(campaign.id, sinceMidnight);
          if (dailyCount >= campaign.dailyLimit) {
            console.log(
              `[scheduler] "${campaign.name}" daily_limit ${campaign.dailyLimit} reached (${dailyCount} sent today), skipping`
            );
            continue;
          }
        }

        // Hourly limit
        if (campaign.hourlyLimit && campaign.hourlyLimit > 0) {
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
          const hourlyCount = await countCampaignSends(campaign.id, oneHourAgo);
          if (hourlyCount >= campaign.hourlyLimit) {
            console.log(
              `[scheduler] "${campaign.name}" hourly_limit ${campaign.hourlyLimit} reached (${hourlyCount} in last hour), skipping`
            );
            continue;
          }
        }

        // Minimum delay between sends
        if (campaign.minimumDelaySeconds && campaign.minimumDelaySeconds > 0) {
          const lastSendAt = await lastCampaignSendAt(campaign.id);
          if (lastSendAt) {
            const secondsSince = Math.floor((Date.now() - lastSendAt.getTime()) / 1000);
            if (secondsSince < campaign.minimumDelaySeconds) {
              console.log(
                `[scheduler] "${campaign.name}" minimum_delay_seconds ${campaign.minimumDelaySeconds} not elapsed (${secondsSince}s since last), skipping`
              );
              continue;
            }
          }
        }

        // ---- ELIGIBILITY ----

        const allowedStatuses = Array.isArray(campaign.allowedStatuses)
          ? (campaign.allowedStatuses as string[])
          : [];
        if (allowedStatuses.length === 0) {
          console.log(`[scheduler] "${campaign.name}" has no allowed statuses, skipping`);
          continue;
        }

        const filter = (campaign.filterJson ?? {}) as CampaignFilter;
        const eligible = await resolveEligibleGroups({
          allowedStatuses,
          filter,
          limit: 200,
        });

        if (eligible.length === 0) {
          // Still update last_run_at to signal the scheduler did tick for this campaign
          await db
            .update(cadences)
            .set({ lastRunAt: new Date() })
            .where(eq(cadences.id, campaign.id));
          continue;
        }

        // Already-enrolled set — exclude active / replied / completed so we
        // don't re-enroll groups the campaign already owns
        const eligibleIds = eligible.map((e) => e.company.id);
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
        const toEnroll = eligible.filter((e) => !enrolledSet.has(e.company.id));

        // Enroll — capped to MAX_ENROLLMENTS_PER_CAMPAIGN_PER_TICK
        let enrolledThisTick = 0;
        for (const { company, primaryContact } of toEnroll.slice(
          0,
          MAX_ENROLLMENTS_PER_CAMPAIGN_PER_TICK
        )) {
          await db.insert(enrollments).values({
            cadenceId: campaign.id,
            companyId: company.id,
            contactId: primaryContact!.id,
            currentStep: 1,
            status: "active",
            nextStepAt: new Date(), // due immediately; execute-step respects limits
          });
          enrolledThisTick++;
        }

        if (enrolledThisTick > 0) {
          console.log(
            `[scheduler] "${campaign.name}" enrolled ${enrolledThisTick} new group(s)`
          );
        }

        await db
          .update(cadences)
          .set({ lastRunAt: new Date() })
          .where(eq(cadences.id, campaign.id));
      } catch (err) {
        console.error(`[scheduler] failed for campaign ${campaign.id}:`, err);
      }
    }

    // 2. Queue due enrollments for execution (only from ACTIVE campaigns)
    const dueEnrollments = await getDueEnrollments(50);
    if (dueEnrollments.length === 0) {
      console.log("[scheduler] no due enrollments");
      return;
    }

    // Filter out enrollments whose campaign is not active (safety double-check)
    const activeCampaignIds = new Set(activeCampaigns.map((c) => c.id));
    const queuable = dueEnrollments.filter((e) => activeCampaignIds.has(e.cadenceId));
    if (queuable.length < dueEnrollments.length) {
      console.log(
        `[scheduler] filtered ${dueEnrollments.length - queuable.length} due enrollment(s) from paused campaigns`
      );
    }

    console.log(`[scheduler] queueing ${queuable.length} due enrollment(s)`);
    for (const enrollment of queuable) {
      await boss.send("execute-cadence-step", { enrollmentId: enrollment.id });
    }
  };
}

// ---- helpers ----

async function countCampaignSends(campaignId: string, since: Date): Promise<number> {
  const rows = (await db
    .select({ c: sql<number>`count(*)::int` })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.action, "cadence_step_executed"),
        eq(auditLogs.entityType, "campaign"),
        eq(auditLogs.entityId, campaignId),
        gte(auditLogs.createdAt, since)
      )
    )) as Array<{ c: number }>;
  return Number(rows[0]?.c ?? 0);
}

async function lastCampaignSendAt(campaignId: string): Promise<Date | null> {
  const rows = await db
    .select({ createdAt: auditLogs.createdAt })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.action, "cadence_step_executed"),
        eq(auditLogs.entityType, "campaign"),
        eq(auditLogs.entityId, campaignId)
      )
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(1);
  return rows[0]?.createdAt ?? null;
}
