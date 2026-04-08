import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, GraphClient } from "@autosales/mail";
import { db, oauthAccounts } from "@autosales/db";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/settings?error=${error}`, request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/settings?error=no_code", request.url));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    const client = new GraphClient(tokens.access_token);
    const profile = await client.getProfile();

    const existing = await db
      .select()
      .from(oauthAccounts)
      .where(eq(oauthAccounts.provider, "microsoft"))
      .limit(1);

    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    if (existing[0]) {
      await db
        .update(oauthAccounts)
        .set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt,
          email: profile.mail || profile.userPrincipalName,
          providerAccountId: profile.id,
          updatedAt: new Date(),
        })
        .where(eq(oauthAccounts.id, existing[0].id));
    } else {
      await db.insert(oauthAccounts).values({
        provider: "microsoft",
        providerAccountId: profile.id,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt,
        email: profile.mail || profile.userPrincipalName,
      });
    }

    return NextResponse.redirect(new URL("/settings?connected=true", request.url));
  } catch (err) {
    console.error("OAuth callback error:", err);
    return NextResponse.redirect(new URL("/settings?error=token_exchange_failed", request.url));
  }
}
