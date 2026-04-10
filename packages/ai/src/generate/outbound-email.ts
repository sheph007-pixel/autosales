import { getOpenAIClient, MODEL } from "../client";
import { emailGenerationSchema, type EmailGeneration } from "../extract/schemas";
import { buildGenerateEmailSystemPrompt, buildGenerateEmailPrompt } from "../prompts/generate-email";
import type { CadenceContext } from "@autosales/core";

export async function generateOutboundEmail(context: CadenceContext): Promise<EmailGeneration> {
  const client = getOpenAIClient();

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: buildGenerateEmailSystemPrompt(context) },
      { role: "user", content: buildGenerateEmailPrompt(context) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "email_generation",
        strict: true,
        schema: {
          type: "object",
          properties: {
            subject: { type: "string" },
            body: { type: "string" },
            reasoning: { type: "string" },
          },
          required: ["subject", "body", "reasoning"],
          additionalProperties: false,
        },
      },
    },
    temperature: 0.7,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI email generation");

  const parsed = JSON.parse(content);
  return emailGenerationSchema.parse(parsed);
}
