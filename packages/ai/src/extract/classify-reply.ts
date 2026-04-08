import { getOpenAIClient, MODEL } from "../client";
import { replyClassificationSchema, type ReplyClassification } from "./schemas";
import { CLASSIFY_REPLY_SYSTEM, buildClassifyReplyPrompt } from "../prompts/classify-reply";

export async function classifyReply(opts: {
  emailBody: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  domain: string;
  priorContext?: string;
}): Promise<ReplyClassification> {
  const client = getOpenAIClient();

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: CLASSIFY_REPLY_SYSTEM },
      { role: "user", content: buildClassifyReplyPrompt(opts) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "reply_classification",
        strict: true,
        schema: {
          type: "object",
          properties: {
            category: {
              type: "string",
              enum: [
                "interested", "not_interested", "follow_up_later", "wrong_person",
                "has_broker", "question", "out_of_office", "neutral", "unsubscribe",
              ],
            },
            confidence: { type: "number" },
            renewalMonthDetected: { type: ["number", "null"] },
            hasPlanDetected: { type: ["boolean", "null"] },
            followUpDate: { type: ["string", "null"] },
            evidence: { type: "string" },
            reasoning: { type: "string" },
          },
          required: [
            "category", "confidence", "renewalMonthDetected",
            "hasPlanDetected", "followUpDate", "evidence", "reasoning",
          ],
          additionalProperties: false,
        },
      },
    },
    temperature: 0.1,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI classification");

  const parsed = JSON.parse(content);
  return replyClassificationSchema.parse(parsed);
}
