import { GraphClient } from "./client";
import type { GraphMessage, SyncResult } from "./types";

export interface ProcessedMessage {
  providerMessageId: string;
  providerThreadId: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  fromAddress: string;
  fromName: string;
  toAddresses: string[];
  receivedAt: Date;
  direction: "inbound" | "outbound";
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function parseGraphMessage(msg: Record<string, unknown>, userEmail: string): ProcessedMessage | null {
  try {
    const from = msg.from as { emailAddress: { name: string; address: string } } | undefined;
    const toRecipients = msg.toRecipients as Array<{ emailAddress: { name: string; address: string } }> | undefined;
    const body = msg.body as { contentType: string; content: string } | undefined;

    if (!from?.emailAddress?.address) return null;

    const fromAddress = from.emailAddress.address.toLowerCase();
    const toAddresses = (toRecipients ?? []).map((r) => r.emailAddress.address.toLowerCase());

    const direction = fromAddress === userEmail.toLowerCase() ? "outbound" : "inbound";

    const bodyHtml = body?.content ?? "";
    const bodyText = body?.contentType === "html" ? stripHtml(bodyHtml) : bodyHtml;

    return {
      providerMessageId: msg.id as string,
      providerThreadId: (msg.conversationId as string) ?? "",
      subject: (msg.subject as string) ?? "",
      bodyText,
      bodyHtml,
      fromAddress,
      fromName: from.emailAddress.name ?? "",
      toAddresses,
      receivedAt: new Date(msg.receivedDateTime as string),
      direction,
    };
  } catch {
    return null;
  }
}

export async function syncFolder(
  client: GraphClient,
  folder: string,
  userEmail: string,
  deltaToken?: string | null
): Promise<{ messages: ProcessedMessage[]; deltaToken: string | null }> {
  const messages: ProcessedMessage[] = [];
  let nextLink: string | undefined;
  let newDeltaToken: string | null = null;

  const initial = await client.getMessagesDelta(folder, deltaToken);
  for (const msg of initial.value) {
    const parsed = parseGraphMessage(msg, userEmail);
    if (parsed) messages.push(parsed);
  }
  nextLink = initial["@odata.nextLink"];
  newDeltaToken = initial["@odata.deltaLink"] ?? null;

  while (nextLink) {
    const page = await client.getMessagesDelta(folder, nextLink);
    for (const msg of page.value) {
      const parsed = parseGraphMessage(msg, userEmail);
      if (parsed) messages.push(parsed);
    }
    nextLink = page["@odata.nextLink"];
    if (page["@odata.deltaLink"]) {
      newDeltaToken = page["@odata.deltaLink"];
    }
  }

  return { messages, deltaToken: newDeltaToken };
}

export async function fullSync(
  client: GraphClient,
  userEmail: string
): Promise<{ messages: ProcessedMessage[]; inboxDelta: string | null; sentDelta: string | null }> {
  const [inbox, sent] = await Promise.all([
    syncFolder(client, "inbox", userEmail),
    syncFolder(client, "sentitems", userEmail),
  ]);

  return {
    messages: [...inbox.messages, ...sent.messages],
    inboxDelta: inbox.deltaToken,
    sentDelta: sent.deltaToken,
  };
}
