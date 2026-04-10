import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, GraphClient } from "@autosales/mail";
import { db, oauthAccounts, ensureTables } from "@autosales/db";
import { eq, sql } from "drizzle-orm";
import { createSessionToken, setSessionCookie, isAllowedEmail } from "@/lib/auth";

function resolveBaseUrl(request: NextRequest): string {
  const fwdHost = request.headers.get("x-forwarded-host");
  if (fwdHost) {
    const proto = request.headers.get("x-forwarded-proto") || "https";
    return `${proto}://${fwdHost}`;
  }
  const host = request.headers.get("host");
  if (host && !host.startsWith("0.0.0.0") && !host.startsWith("127.0.0.1")) {
    return `https://${host}`;
  }
  return process.env.APP_URL || "https://crm-production-8b2a.up.railway.app";
}

export async function GET(request: NextRequest) {
  const baseUrl = resolveBaseUrl(request);
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    console.error("OAuth error:", error);
    return NextResponse.redirect(new URL(`/login?error=${error}`, baseUrl));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=no_code", baseUrl));
  }

  try {
    await ensureTables();

    // Ensure oauth_accounts table exists before trying to use it
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS oauth_accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider VARCHAR(50) NOT NULL,
        provider_account_id VARCHAR(255),
        access_token TEXT,
        refresh_token TEXT,
        token_expires_at TIMESTAMPTZ,
        email VARCHAR(255),
        delta_token TEXT,
        last_synced_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const tokens = await exchangeCodeForTokens(code);
    const client = new GraphClient(tokens.access_token);
    const profile = await client.getProfile();
    const userEmail = (profile.mail || profile.userPrincipalName || "").toLowerCase();

    if (!userEmail) {
      return NextResponse.redirect(new URL("/login?error=no_email", baseUrl));
    }

    if (!isAllowedEmail(userEmail)) {
      console.warn(`Unauthorized login attempt from: ${userEmail}`);
      return NextResponse.redirect(new URL("/login?error=unauthorized", baseUrl));
    }

    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    const [existing] = await db
      .select()
      .from(oauthAccounts)
      .where(eq(oauthAccounts.provider, "microsoft"))
      .limit(1);

    let accountId: string;

    if (existing) {
      await db
        .update(oauthAccounts)
        .set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt,
          email: userEmail,
          providerAccountId: profile.id,
          updatedAt: new Date(),
        })
        .where(eq(oauthAccounts.id, existing.id));
      accountId = existing.id;
    } else {
      const [created] = await db
        .insert(oauthAccounts)
        .values({
          provider: "microsoft",
          providerAccountId: profile.id,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt,
          email: userEmail,
        })
        .returning();
      accountId = created!.id;
    }

    const sessionToken = await createSessionToken({
      id: accountId,
      email: userEmail,
      name: profile.displayName || userEmail,
      microsoftId: profile.id,
    });

    await setSessionCookie(sessionToken);
    return NextResponse.redirect(new URL("/", baseUrl));
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("Auth callback error:", errorMessage);
    console.error("Full error:", err);
    // Pass error detail in URL for debugging (remove in production later)
    const errorParam = encodeURIComponent(errorMessage.slice(0, 200));
    return NextResponse.redirect(new URL(`/login?error=auth_failed&detail=${errorParam}`, baseUrl));
  }
}
