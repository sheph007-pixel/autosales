export interface GraphTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export interface GraphMessage {
  id: string;
  conversationId: string;
  subject: string;
  bodyPreview: string;
  body: {
    contentType: string;
    content: string;
  };
  from: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  toRecipients: Array<{
    emailAddress: {
      name: string;
      address: string;
    };
  }>;
  ccRecipients: Array<{
    emailAddress: {
      name: string;
      address: string;
    };
  }>;
  receivedDateTime: string;
  sentDateTime: string;
  isRead: boolean;
  isDraft: boolean;
  parentFolderId: string;
}

export interface GraphMessageListResponse {
  value: GraphMessage[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
}

export interface GraphSendMessage {
  message: {
    subject: string;
    body: {
      contentType: "Text" | "HTML";
      content: string;
    };
    toRecipients: Array<{
      emailAddress: {
        address: string;
        name?: string;
      };
    }>;
  };
  saveToSentItems: boolean;
}

export interface SyncResult {
  messagesProcessed: number;
  newCompanies: number;
  newContacts: number;
  newThreads: number;
  deltaToken: string | null;
  errors: string[];
}
