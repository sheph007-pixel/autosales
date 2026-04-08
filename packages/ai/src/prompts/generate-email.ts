export const GENERATE_EMAIL_SYSTEM = `You are an AI assistant helping a group health insurance broker craft outbound sales emails to employer prospects.

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

export function buildGenerateEmailPrompt(opts: {
  contactName: string;
  contactEmail: string;
  companyName: string | null;
  domain: string;
  renewalMonth: number | null;
  hasGroupHealthPlan: boolean | null;
  interestStatus: string | null;
  domainSummary: string | null;
  conversationHistory: string | null;
  stepNumber: number;
  stepPrompt: string | null;
  cadenceName: string;
}): string {
  let prompt = `Generate an outbound email for step ${opts.stepNumber} of the "${opts.cadenceName}" cadence.\n\n`;

  prompt += `Recipient: ${opts.contactName} <${opts.contactEmail}>\n`;
  prompt += `Company: ${opts.companyName ?? opts.domain}\n`;
  prompt += `Domain: ${opts.domain}\n`;

  if (opts.renewalMonth) {
    prompt += `Known renewal month: ${opts.renewalMonth}\n`;
  }

  if (opts.hasGroupHealthPlan !== null) {
    prompt += `Has group health plan: ${opts.hasGroupHealthPlan ? "Yes" : "No/Unknown"}\n`;
  }

  if (opts.interestStatus && opts.interestStatus !== "unknown") {
    prompt += `Interest status: ${opts.interestStatus}\n`;
  }

  if (opts.domainSummary) {
    prompt += `\nDomain memory:\n${opts.domainSummary}\n`;
  }

  if (opts.conversationHistory) {
    prompt += `\nConversation status:\n${opts.conversationHistory}\n`;
  }

  if (opts.stepPrompt) {
    prompt += `\nStep-specific guidance:\n${opts.stepPrompt}\n`;
  }

  prompt += `\nGenerate a unique, context-aware email. Respond with a JSON object with "subject", "body", and "reasoning" fields.`;

  return prompt;
}
