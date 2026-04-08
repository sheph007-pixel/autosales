import { z } from "zod";

export const REPLY_CATEGORIES = [
  "interested",
  "not_interested",
  "follow_up_later",
  "wrong_person",
  "has_broker",
  "question",
  "out_of_office",
  "neutral",
  "unsubscribe",
] as const;

export type ReplyCategory = (typeof REPLY_CATEGORIES)[number];

export const classificationResultSchema = z.object({
  category: z.enum(REPLY_CATEGORIES),
  confidence: z.number().min(0).max(1),
  renewalMonthDetected: z.number().min(1).max(12).nullable(),
  hasPlanDetected: z.boolean().nullable(),
  followUpDate: z.string().nullable().describe("ISO date string if follow-up timing mentioned"),
  evidence: z.string().describe("Exact quote from the email supporting this classification"),
  reasoning: z.string().describe("Brief explanation of why this category was chosen"),
});

export type ClassificationResult = z.infer<typeof classificationResultSchema>;

export const factExtractionSchema = z.object({
  companyName: z.string().nullable(),
  contactName: z.string().nullable(),
  contactTitle: z.string().nullable(),
  renewalMonth: z.number().min(1).max(12).nullable(),
  hasGroupHealthPlan: z.boolean().nullable(),
  currentBroker: z.string().nullable(),
  employeeCount: z.string().nullable(),
  interestLevel: z.enum(["high", "medium", "low", "none", "unknown"]),
  objectionType: z.string().nullable().describe("e.g., 'happy with current broker', 'too expensive', 'bad timing'"),
  followUpTiming: z.string().nullable().describe("e.g., 'October', 'Q1 2025', 'next year'"),
  keyInsights: z.array(z.string()).describe("Important facts learned from this email"),
});

export type FactExtraction = z.infer<typeof factExtractionSchema>;

export const CONFIDENCE_THRESHOLDS = {
  AUTO_APPLY: 0.8,
  FLAG_FOR_REVIEW: 0.5,
  REQUIRES_HUMAN: 0.5,
} as const;
