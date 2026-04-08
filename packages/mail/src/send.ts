import { GraphClient } from "./client";

export async function sendEmail(
  client: GraphClient,
  opts: {
    to: string;
    toName?: string;
    subject: string;
    body: string;
    isHtml?: boolean;
  }
) {
  await client.sendMail(opts);
}
