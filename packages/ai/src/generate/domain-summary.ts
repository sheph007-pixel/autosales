import { getOpenAIClient, MODEL } from "../client";
import { domainSummarySchema, type DomainSummary } from "../extract/schemas";
import { DOMAIN_SUMMARY_SYSTEM, buildDomainSummaryPrompt } from "../prompts/domain-summary";

export async function generateDomainSummary(opts: {
  domain: string;
  companyName: string | null;
  contacts: Array<{ name: string; email: string; title: string | null }>;
  recentEmails: Array<{
    direction: string;
    from: string;
    subject: string;
    bodyPreview: string;
    date: string;
  }>;
  existingSummary?: string | null;
  classifications?: Array<{ category: string; evidence: string | null }>;
}): Promise<DomainSummary> {
  const client = getOpenAIClient();

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: DOMAIN_SUMMARY_SYSTEM },
      { role: "user", content: buildDomainSummaryPrompt(opts) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "domain_summary",
        strict: true,
        schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            benefitsSituation: { type: "string" },
            conversationStatus: { type: "string" },
            nextSteps: { type: "string" },
            keyFacts: { type: "object", additionalProperties: { type: "string" } },
            renewalInfo: {
              type: "object",
              properties: {
                month: { type: ["number", "null"] },
                source: { type: ["string", "null"] },
                confidence: { type: "number" },
              },
              required: ["month", "source", "confidence"],
              additionalProperties: false,
            },
          },
          required: ["summary", "benefitsSituation", "conversationStatus", "nextSteps", "keyFacts", "renewalInfo"],
          additionalProperties: false,
        },
      },
    },
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI domain summary");

  const parsed = JSON.parse(content);
  return domainSummarySchema.parse(parsed);
}
