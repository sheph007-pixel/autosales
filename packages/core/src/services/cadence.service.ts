import { eq, and, lte, desc } from "drizzle-orm";
import { db, cadences, cadenceSteps, enrollments, companies, contacts, domainMemory } from "@autosales/db";
import type { Cadence, Enrollment } from "@autosales/db";
import { addDays } from "../utils/date-utils";
import type { CadenceContext, AgentProfileContext } from "../types/cadence";
import { getAgentProfile } from "./agent-profile.service";

export interface CampaignInput {
  name: string;
  description?: string | null;
  triggerType?: string;
  goal?: string | null;
  instructions?: string | null;
  allowedStatuses?: string[];
  filterJson?: Record<string, unknown>;
  dailyLimit?: number | null;
  hourlyLimit?: number | null;
  minimumDelaySeconds?: number | null;
  isActive?: boolean;
  steps: { delayDays: number; actionType?: string; templatePrompt: string }[];
}

export async function createCadence(data: CampaignInput): Promise<Cadence> {
  const [cadence] = await db
    .insert(cadences)
    .values({
      name: data.name,
      description: data.description ?? null,
      triggerType: data.triggerType ?? "manual",
      goal: data.goal ?? null,
      instructions: data.instructions ?? null,
      allowedStatuses: data.allowedStatuses ?? ["lead"],
      filterJson: data.filterJson ?? {},
      dailyLimit: data.dailyLimit ?? null,
      hourlyLimit: data.hourlyLimit ?? null,
      minimumDelaySeconds: data.minimumDelaySeconds ?? null,
      // Safety: new campaigns default to paused. User must explicitly Start
      // from the detail page after reviewing the targeting preview.
      isActive: data.isActive ?? false,
    })
    .returning();

  for (let i = 0; i < data.steps.length; i++) {
    const step = data.steps[i]!;
    await db.insert(cadenceSteps).values({
      cadenceId: cadence!.id,
      stepNumber: i + 1,
      delayDays: step.delayDays,
      actionType: step.actionType ?? "send_email",
      templatePrompt: step.templatePrompt,
    });
  }

  return cadence!;
}

export async function updateCadence(
  id: string,
  data: Partial<Omit<CampaignInput, "steps">>
): Promise<Cadence | null> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) set.name = data.name;
  if (data.description !== undefined) set.description = data.description;
  if (data.triggerType !== undefined) set.triggerType = data.triggerType;
  if (data.goal !== undefined) set.goal = data.goal;
  if (data.instructions !== undefined) set.instructions = data.instructions;
  if (data.allowedStatuses !== undefined) set.allowedStatuses = data.allowedStatuses;
  if (data.filterJson !== undefined) set.filterJson = data.filterJson;
  if (data.dailyLimit !== undefined) set.dailyLimit = data.dailyLimit;
  if (data.hourlyLimit !== undefined) set.hourlyLimit = data.hourlyLimit;
  if (data.minimumDelaySeconds !== undefined) set.minimumDelaySeconds = data.minimumDelaySeconds;
  if (data.isActive !== undefined) set.isActive = data.isActive;

  const [updated] = await db
    .update(cadences)
    .set(set)
    .where(eq(cadences.id, id))
    .returning();
  return updated ?? null;
}

export async function setCadenceActive(id: string, isActive: boolean): Promise<Cadence | null> {
  return updateCadence(id, { isActive });
}

export async function deleteCadence(id: string): Promise<void> {
  await db.delete(cadences).where(eq(cadences.id, id));
}

export async function getCadence(id: string) {
  const [cadence] = await db.select().from(cadences).where(eq(cadences.id, id)).limit(1);
  if (!cadence) return null;

  const steps = await db
    .select()
    .from(cadenceSteps)
    .where(eq(cadenceSteps.cadenceId, id))
    .orderBy(cadenceSteps.stepNumber);

  return { ...cadence, steps };
}

export async function listCadences() {
  return db.select().from(cadences).orderBy(desc(cadences.createdAt));
}

export async function enrollContact(opts: {
  cadenceId: string;
  companyId: string;
  contactId: string;
}): Promise<Enrollment> {
  const [existingActive] = await db
    .select()
    .from(enrollments)
    .where(
      and(
        eq(enrollments.cadenceId, opts.cadenceId),
        eq(enrollments.contactId, opts.contactId),
        eq(enrollments.status, "active")
      )
    )
    .limit(1);

  if (existingActive) return existingActive;

  const [firstStep] = await db
    .select()
    .from(cadenceSteps)
    .where(and(eq(cadenceSteps.cadenceId, opts.cadenceId), eq(cadenceSteps.stepNumber, 1)))
    .limit(1);

  const delayDays = firstStep?.delayDays ?? 0;

  const [enrollment] = await db
    .insert(enrollments)
    .values({
      cadenceId: opts.cadenceId,
      companyId: opts.companyId,
      contactId: opts.contactId,
      currentStep: 1,
      status: "active",
      nextStepAt: addDays(new Date(), delayDays),
    })
    .returning();

  return enrollment!;
}

export async function getDueEnrollments(limit: number = 50): Promise<Enrollment[]> {
  return db
    .select()
    .from(enrollments)
    .where(
      and(
        eq(enrollments.status, "active"),
        lte(enrollments.nextStepAt, new Date())
      )
    )
    .orderBy(enrollments.nextStepAt)
    .limit(limit);
}

export async function advanceEnrollment(enrollmentId: string): Promise<Enrollment | null> {
  const [enrollment] = await db
    .select()
    .from(enrollments)
    .where(eq(enrollments.id, enrollmentId))
    .limit(1);

  if (!enrollment) return null;

  const nextStepNumber = enrollment.currentStep + 1;
  const [nextStep] = await db
    .select()
    .from(cadenceSteps)
    .where(
      and(
        eq(cadenceSteps.cadenceId, enrollment.cadenceId),
        eq(cadenceSteps.stepNumber, nextStepNumber)
      )
    )
    .limit(1);

  if (!nextStep) {
    const [completed] = await db
      .update(enrollments)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(enrollments.id, enrollmentId))
      .returning();
    return completed!;
  }

  const [advanced] = await db
    .update(enrollments)
    .set({
      currentStep: nextStepNumber,
      nextStepAt: addDays(new Date(), nextStep.delayDays),
    })
    .where(eq(enrollments.id, enrollmentId))
    .returning();

  return advanced!;
}

export async function pauseEnrollment(enrollmentId: string, reason: string = "replied") {
  const status = reason === "replied" ? "replied" : "paused";
  const [updated] = await db
    .update(enrollments)
    .set({ status })
    .where(eq(enrollments.id, enrollmentId))
    .returning();
  return updated;
}

export async function pauseCompanyEnrollments(companyId: string, reason: string = "replied") {
  const status = reason === "replied" ? "replied" : "paused";
  await db
    .update(enrollments)
    .set({ status })
    .where(
      and(eq(enrollments.companyId, companyId), eq(enrollments.status, "active"))
    );
}

export async function buildCadenceContext(enrollmentId: string): Promise<CadenceContext | null> {
  const [enrollment] = await db
    .select()
    .from(enrollments)
    .where(eq(enrollments.id, enrollmentId))
    .limit(1);

  if (!enrollment) return null;

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, enrollment.companyId))
    .limit(1);

  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, enrollment.contactId))
    .limit(1);

  const [memory] = await db
    .select()
    .from(domainMemory)
    .where(eq(domainMemory.companyId, enrollment.companyId))
    .limit(1);

  const [step] = await db
    .select()
    .from(cadenceSteps)
    .where(
      and(
        eq(cadenceSteps.cadenceId, enrollment.cadenceId),
        eq(cadenceSteps.stepNumber, enrollment.currentStep)
      )
    )
    .limit(1);

  const [cadence] = await db
    .select()
    .from(cadences)
    .where(eq(cadences.id, enrollment.cadenceId))
    .limit(1);

  if (!company || !contact || !cadence) return null;

  const profile = await getAgentProfile();
  const agentProfileCtx: AgentProfileContext | null = profile
    ? {
        name: profile.name,
        company: profile.company,
        identity: profile.identity,
        targetDescription: profile.targetDescription,
        offerDescription: profile.offerDescription,
        goals: profile.goals,
        toneRules: profile.toneRules,
        systemInstructions: profile.systemInstructions,
        guardrails: profile.guardrails,
      }
    : null;

  return {
    companyId: company.id,
    contactId: contact.id,
    companyName: company.companyName,
    domain: company.domain,
    contactName: contact.name,
    contactEmail: contact.email,
    renewalMonth: company.renewalMonth,
    hasGroupHealthPlan: company.hasGroupHealthPlan,
    interestStatus: company.interestStatus,
    domainSummary: memory?.summary ?? null,
    conversationHistory: memory?.conversationStatus ?? null,
    stepNumber: enrollment.currentStep,
    stepPrompt: step?.templatePrompt ?? null,
    cadenceName: cadence.name,
    campaignGoal: cadence.goal ?? null,
    campaignInstructions: cadence.instructions ?? null,
    agentProfile: agentProfileCtx,
  };
}

export async function getCompanyEnrollments(companyId: string) {
  return db
    .select()
    .from(enrollments)
    .where(eq(enrollments.companyId, companyId))
    .orderBy(desc(enrollments.createdAt));
}
