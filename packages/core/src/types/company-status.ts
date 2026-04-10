export const COMPANY_STATUSES = [
  "current_client",
  "old_client",
  "lead",
  "not_qualified",
] as const;

export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

export const STATUS_LABELS: Record<CompanyStatus, string> = {
  current_client: "Current Client",
  old_client: "Old Client",
  lead: "Lead",
  not_qualified: "Not Qualified",
};

export const STATUS_COLORS: Record<CompanyStatus, string> = {
  current_client: "bg-emerald-100 text-emerald-800",
  old_client: "bg-gray-100 text-gray-600",
  lead: "bg-blue-100 text-blue-800",
  not_qualified: "bg-red-100 text-red-800",
};

// Interest status kept for internal classification use, not surfaced in UI
export const INTEREST_STATUSES = [
  "unknown",
  "interested",
  "not_interested",
  "follow_up_later",
  "wrong_contact",
  "has_broker",
  "no_plan",
] as const;

export type InterestStatus = (typeof INTEREST_STATUSES)[number];

export const CONTACT_STATUSES = [
  "active",
  "wrong_person",
  "bounced",
  "unsubscribed",
  "inactive",
] as const;

export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const ENROLLMENT_STATUSES = [
  "active",
  "paused",
  "completed",
  "replied",
  "suppressed",
] as const;

export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const TASK_TYPES = [
  "follow_up",
  "review_reply",
  "send_email",
  "update_status",
  "human_review",
] as const;

export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_STATUSES = [
  "pending",
  "in_progress",
  "completed",
  "skipped",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
