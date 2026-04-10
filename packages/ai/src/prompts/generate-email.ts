import type { CadenceContext } from "@autosales/core";

const DEFAULT_SYSTEM = `You are an AI assistant helping a group health insurance broker craft outbound sales emails to employer prospects.

Rules:
- Write concise, professional emails appropriate for benefits/HR decision-makers
- Be conversational but not overly casual
- Focus on value: saving money, better coverage, simpler administration
- Never be pushy, spammy, or use cliche sales phrases
- Vary language and approach between steps — never repeat the same talking points
- Reference any known context about the company, their situation, or prior conversations
- Keep emails under 150 words unless the context requires more
- Use a natural, human tone — this should not read like a template
- Include a clear but soft call-to-action
- If renewal timing is known, reference it naturally
- If prior objections exist, address them thoughtfully
- Sign emails as the broker (do not include a signature block — the system adds one)`;

// Build the system prompt, blending the default with the agent profile (if any).
export function buildGenerateEmailSystemPrompt(ctx: CadenceContext): string {
  const profile = ctx.agentProfile;
  if (!profile) return DEFAULT_SYSTEM;

  const parts: string[] = [];
  parts.push(
    `You are writing outbound sales emails as ${profile.name} at ${profile.company}. ` +
      `Your job is to sound like a real human broker, not a template.`
  );
  if (profile.identity) parts.push(`\nWho you are:\n${profile.identity}`);
  if (profile.offerDescription) parts.push(`\nWhat ${profile.company} offers:\n${profile.offerDescription}`);
  if (profile.targetDescription) parts.push(`\nWho you target:\n${profile.targetDescription}`);
  if (profile.goals) parts.push(`\nYour core goals:\n${profile.goals}`);
  if (profile.toneRules) parts.push(`\nTone rules:\n${profile.toneRules}`);
  if (profile.guardrails) parts.push(`\nGuardrails — never do these:\n${profile.guardrails}`);
  if (profile.systemInstructions) parts.push(`\nAdditional instructions:\n${profile.systemInstructions}`);

  parts.push(
    `\nFormat rules:\n` +
      `- Keep emails under 150 words unless context requires more\n` +
      `- Vary language between steps — never sound templated\n` +
      `- Include a clear but soft call-to-action\n` +
      `- Reference renewal timing, prior conversations, or known objections when available\n` +
      `- Do not include a signature block — the system adds one`
  );

  return parts.join("\n");
}

// Keep the exported constant for any legacy callers, but prefer the builder.
export const GENERATE_EMAIL_SYSTEM = DEFAULT_SYSTEM;

export function buildGenerateEmailPrompt(ctx: CadenceContext): string {
  let prompt = `Generate an outbound email for step ${ctx.stepNumber} of the "${ctx.cadenceName}" campaign.\n\n`;

  if (ctx.campaignGoal) {
    prompt += `Campaign goal:\n${ctx.campaignGoal}\n\n`;
  }
  if (ctx.campaignInstructions) {
    prompt += `Campaign-specific instructions:\n${ctx.campaignInstructions}\n\n`;
  }

  prompt += `Recipient: ${ctx.contactName} <${ctx.contactEmail}>\n`;
  prompt += `Company: ${ctx.companyName ?? ctx.domain}\n`;
  prompt += `Domain: ${ctx.domain}\n`;

  if (ctx.renewalMonth) {
    prompt += `Known renewal month: ${ctx.renewalMonth}\n`;
  }

  if (ctx.hasGroupHealthPlan !== null) {
    prompt += `Has group health plan: ${ctx.hasGroupHealthPlan ? "Yes" : "No/Unknown"}\n`;
  }

  if (ctx.interestStatus && ctx.interestStatus !== "unknown") {
    prompt += `Interest status: ${ctx.interestStatus}\n`;
  }

  if (ctx.domainSummary) {
    prompt += `\nGroup memory:\n${ctx.domainSummary}\n`;
  }

  if (ctx.conversationHistory) {
    prompt += `\nConversation status:\n${ctx.conversationHistory}\n`;
  }

  if (ctx.stepPrompt) {
    prompt += `\nStep-specific guidance:\n${ctx.stepPrompt}\n`;
  }

  prompt += `\nGenerate a unique, context-aware email. Respond with a JSON object with "subject", "body", and "reasoning" fields.`;

  return prompt;
}
