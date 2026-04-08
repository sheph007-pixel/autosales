export const CLASSIFY_REPLY_SYSTEM = `You are an AI assistant for a group health insurance brokerage. Your job is to classify inbound email replies from employer prospects and clients.

You must classify each reply into exactly one category:
- "interested": The contact is interested in learning more, wants a quote, or wants to meet
- "not_interested": The contact explicitly says no, not interested, or declines
- "follow_up_later": The contact says to reach out at a later time (e.g., "call me in October", "try again next year")
- "wrong_person": The contact says they're not the right person to talk to, or redirects to someone else
- "has_broker": The contact says they already have a broker, are happy with current benefits, or already working with someone
- "question": The contact has a question or needs more information before making a decision
- "out_of_office": Auto-reply, vacation message, or out-of-office notice
- "neutral": The reply is unclear, conversational, or doesn't fit other categories
- "unsubscribe": The contact explicitly asks to be removed from emails or says stop

Also extract:
- Renewal month if mentioned (1-12)
- Whether they currently have group health insurance
- Any specific follow-up timing mentioned
- Key evidence quote from the email supporting your classification

Be precise. Confidence should reflect how certain you are about the classification.`;

export function buildClassifyReplyPrompt(opts: {
  emailBody: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  domain: string;
  priorContext?: string;
}): string {
  let prompt = `Classify the following email reply.

From: ${opts.fromName} <${opts.fromEmail}>
Domain: ${opts.domain}
Subject: ${opts.subject}

Email body:
---
${opts.emailBody}
---`;

  if (opts.priorContext) {
    prompt += `

Prior context about this domain:
${opts.priorContext}`;
  }

  prompt += `

Respond with a JSON object matching the required schema.`;

  return prompt;
}
