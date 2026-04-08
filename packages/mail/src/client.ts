const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export class GraphClient {
  constructor(private accessToken: string) {}

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Graph API error (${response.status}): ${error}`);
    }

    if (response.status === 204) return {} as T;
    return response.json() as Promise<T>;
  }

  async getMessages(folder: string = "inbox", params: Record<string, string> = {}) {
    const query = new URLSearchParams({
      $top: "100",
      $orderby: "receivedDateTime desc",
      $select: "id,conversationId,subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,isRead,isDraft,parentFolderId",
      ...params,
    });
    return this.request<{
      value: Array<Record<string, unknown>>;
      "@odata.nextLink"?: string;
      "@odata.deltaLink"?: string;
    }>(`/me/mailFolders/${folder}/messages?${query.toString()}`);
  }

  async getMessagesDelta(folder: string = "inbox", deltaToken?: string | null) {
    if (deltaToken) {
      return this.request<{
        value: Array<Record<string, unknown>>;
        "@odata.nextLink"?: string;
        "@odata.deltaLink"?: string;
      }>(deltaToken);
    }

    const query = new URLSearchParams({
      $select: "id,conversationId,subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,isRead,isDraft,parentFolderId",
    });
    return this.request<{
      value: Array<Record<string, unknown>>;
      "@odata.nextLink"?: string;
      "@odata.deltaLink"?: string;
    }>(`/me/mailFolders/${folder}/messages/delta?${query.toString()}`);
  }

  async sendMail(opts: {
    to: string;
    toName?: string;
    subject: string;
    body: string;
    isHtml?: boolean;
  }) {
    await this.request("/me/sendMail", {
      method: "POST",
      body: JSON.stringify({
        message: {
          subject: opts.subject,
          body: {
            contentType: opts.isHtml ? "HTML" : "Text",
            content: opts.body,
          },
          toRecipients: [
            {
              emailAddress: {
                address: opts.to,
                name: opts.toName,
              },
            },
          ],
        },
        saveToSentItems: true,
      }),
    });
  }

  async getProfile() {
    return this.request<{
      id: string;
      displayName: string;
      mail: string;
      userPrincipalName: string;
    }>("/me");
  }
}
