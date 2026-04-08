export const COMPANY_STATUSES = [
  "prospect",
  "active_opportunity",
  "quoted",
  "client",
  "dormant",
  "suppressed",
] as const;

export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

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
