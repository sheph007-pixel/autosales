export const DOMAIN_SUMMARY_SYSTEM = `You are an AI assistant for a group health insurance brokerage. Your job is to create and update a living memory summary for a company/domain.

The summary should capture:
1. What this company is and what we know about them
2. Their current benefits/group health situation
3. Renewal timing (if known)
4. Who we've communicated with and their roles
5. Current status of our relationship/conversation
6. What should happen next

Write in a concise, factual style. This summary will be used as context for future outreach and decision-making.`;

export function buildDomainSummaryPrompt(opts: {
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
}): string {
  let prompt = `Generate or update the domain memory summary for ${opts.domain}`;
  if (opts.companyName) prompt += ` (${opts.companyName})`;
  prompt += ".\n\n";

  prompt += "Known contacts:\n";
  for (const c of opts.contacts) {
    prompt += `- ${c.name} <${c.email}>${c.title ? ` (${c.title})` : ""}\n`;
  }

  prompt += "\nRecent email history (newest first):\n";
  for (const e of opts.recentEmails.slice(0, 15)) {
    prompt += `- [${e.direction.toUpperCase()}] ${e.date} | From: ${e.from} | Subject: ${e.subject}\n  Preview: ${e.bodyPreview.slice(0, 200)}\n`;
  }

  if (opts.classifications?.length) {
    prompt += "\nAI classifications of replies:\n";
    for (const c of opts.classifications) {
      prompt += `- ${c.category}${c.evidence ? `: "${c.evidence}"` : ""}\n`;
    }
  }

  if (opts.existingSummary) {
    prompt += `\nPrevious summary (update this with new information):\n${opts.existingSummary}\n`;
  }

  prompt += "\nRespond with a JSON object matching the required schema.";

  return prompt;
}
