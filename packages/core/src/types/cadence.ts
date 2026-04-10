export const CADENCE_TRIGGER_TYPES = [
  "manual",
  "renewal_approaching",
  "new_domain",
  "reactivation",
] as const;

export type CadenceTriggerType = (typeof CADENCE_TRIGGER_TYPES)[number];

export const CADENCE_ACTION_TYPES = [
  "send_email",
  "wait_for_reply",
  "check_status",
] as const;

export type CadenceActionType = (typeof CADENCE_ACTION_TYPES)[number];

export interface AgentProfileContext {
  name: string;
  company: string;
  identity: string | null;
  targetDescription: string | null;
  offerDescription: string | null;
  goals: string | null;
  toneRules: string | null;
  systemInstructions: string | null;
  guardrails: string | null;
}

export interface CadenceContext {
  companyId: string;
  contactId: string;
  companyName: string | null;
  domain: string;
  contactName: string;
  contactEmail: string;
  renewalMonth: number | null;
  hasGroupHealthPlan: boolean | null;
  interestStatus: string | null;
  domainSummary: string | null;
  conversationHistory: string | null;
  stepNumber: number;
  stepPrompt: string | null;
  cadenceName: string;
  campaignGoal: string | null;
  campaignInstructions: string | null;
  agentProfile: AgentProfileContext | null;
}
