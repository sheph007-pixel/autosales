import { getOpenAIClient, MODEL_MINI } from "../client";
import { factExtractionSchema, type FactExtraction } from "./schemas";
import { EXTRACT_FACTS_SYSTEM, buildExtractFactsPrompt } from "../prompts/extract-facts";

export async function extractFacts(opts: {
  emailBody: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  domain: string;
}): Promise<FactExtraction> {
  const client = getOpenAIClient();

  const response = await client.chat.completions.create({
    model: MODEL_MINI,
    messages: [
      { role: "system", content: EXTRACT_FACTS_SYSTEM },
      { role: "user", content: buildExtractFactsPrompt(opts) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "fact_extraction",
        strict: true,
        schema: {
          type: "object",
          properties: {
            companyName: { type: ["string", "null"] },
            contactName: { type: ["string", "null"] },
            contactTitle: { type: ["string", "null"] },
            renewalMonth: { type: ["number", "null"] },
            hasGroupHealthPlan: { type: ["boolean", "null"] },
            currentBroker: { type: ["string", "null"] },
            employeeCount: { type: ["string", "null"] },
            interestLevel: { type: "string", enum: ["high", "medium", "low", "none", "unknown"] },
            objectionType: { type: ["string", "null"] },
            followUpTiming: { type: ["string", "null"] },
            keyInsights: { type: "array", items: { type: "string" } },
          },
          required: [
            "companyName", "contactName", "contactTitle", "renewalMonth",
            "hasGroupHealthPlan", "currentBroker", "employeeCount",
            "interestLevel", "objectionType", "followUpTiming", "keyInsights",
          ],
          additionalProperties: false,
        },
      },
    },
    temperature: 0.1,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI fact extraction");

  const parsed = JSON.parse(content);
  return factExtractionSchema.parse(parsed);
}
