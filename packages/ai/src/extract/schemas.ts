import { z } from "zod";

export const replyClassificationSchema = z.object({
  category: z.enum([
    "interested",
    "not_interested",
    "follow_up_later",
    "wrong_person",
    "has_broker",
    "question",
    "out_of_office",
    "neutral",
    "unsubscribe",
  ]),
  confidence: z.number().min(0).max(1),
  renewalMonthDetected: z.number().min(1).max(12).nullable(),
  hasPlanDetected: z.boolean().nullable(),
  followUpDate: z.string().nullable(),
  evidence: z.string(),
  reasoning: z.string(),
});

export const factExtractionSchema = z.object({
  companyName: z.string().nullable(),
  contactName: z.string().nullable(),
  contactTitle: z.string().nullable(),
  renewalMonth: z.number().min(1).max(12).nullable(),
  hasGroupHealthPlan: z.boolean().nullable(),
  currentBroker: z.string().nullable(),
  employeeCount: z.string().nullable(),
  interestLevel: z.enum(["high", "medium", "low", "none", "unknown"]),
  objectionType: z.string().nullable(),
  followUpTiming: z.string().nullable(),
  keyInsights: z.array(z.string()),
});

export const domainSummarySchema = z.object({
  summary: z.string(),
  benefitsSituation: z.string(),
  conversationStatus: z.string(),
  nextSteps: z.string(),
  keyFacts: z.record(z.string()),
  renewalInfo: z.object({
    month: z.number().nullable(),
    source: z.string().nullable(),
    confidence: z.number().min(0).max(1),
  }),
});

export const emailGenerationSchema = z.object({
  subject: z.string(),
  body: z.string(),
  reasoning: z.string(),
});

export type ReplyClassification = z.infer<typeof replyClassificationSchema>;
export type FactExtraction = z.infer<typeof factExtractionSchema>;
export type DomainSummary = z.infer<typeof domainSummarySchema>;
export type EmailGeneration = z.infer<typeof emailGenerationSchema>;
