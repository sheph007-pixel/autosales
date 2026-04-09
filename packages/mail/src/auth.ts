import type { GraphTokenResponse } from "./types";

const MICROSOFT_AUTH_URL = "https://login.microsoftonline.com";

// Combined scopes for both authentication AND mail access
const GRAPH_SCOPES = [
  "openid",
  "profile",
  "email",
  "User.Read",
  "Mail.Read",
  "Mail.Send",
  "Mail.ReadWrite",
  "offline_access",
].join(" ");

function getConfig() {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const tenantId = process.env.MICROSOFT_TENANT_ID ?? "common";
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Microsoft OAuth configuration incomplete. Set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and MICROSOFT_REDIRECT_URI.");
  }

  return { clientId, clientSecret, tenantId, redirectUri };
}

export function getAuthorizationUrl(state?: string): string {
  const { clientId, tenantId, redirectUri } = getConfig();

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: GRAPH_SCOPES,
    response_mode: "query",
    prompt: "consent",
  });

  if (state) params.set("state", state);

  return `${MICROSOFT_AUTH_URL}/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<GraphTokenResponse> {
  const { clientId, clientSecret, tenantId, redirectUri } = getConfig();

  const response = await fetch(
    `${MICROSOFT_AUTH_URL}/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        scope: GRAPH_SCOPES,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  return response.json() as Promise<GraphTokenResponse>;
}

export async function refreshAccessToken(refreshToken: string): Promise<GraphTokenResponse> {
  const { clientId, clientSecret, tenantId } = getConfig();

  const response = await fetch(
    `${MICROSOFT_AUTH_URL}/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
        scope: GRAPH_SCOPES,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  return response.json() as Promise<GraphTokenResponse>;
}
