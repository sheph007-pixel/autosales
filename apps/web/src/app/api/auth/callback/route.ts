import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, GraphClient } from "@autosales/mail";
import { db, oauthAccounts } from "@autosales/db";
import { eq } from "drizzle-orm";
import { createSessionToken, setSessionCookie, isAllowedEmail } from "@/lib/auth";

function getPublicUrl(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  return process.env.APP_URL || `${request.nextUrl.protocol}//${request.nextUrl.host}`;
}

export async function GET(request: NextRequest) {
  const publicUrl = getPublicUrl(request);
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    console.error("OAuth error:", error);
    return NextResponse.redirect(new URL(`/login?error=${error}`, publicUrl));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=no_code", publicUrl));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const client = new GraphClient(tokens.access_token);
    const profile = await client.getProfile();
    const userEmail = (profile.mail || profile.userPrincipalName || "").toLowerCase();

    if (!userEmail) {
      return NextResponse.redirect(new URL("/login?error=no_email", publicUrl));
    }

    if (!isAllowedEmail(userEmail)) {
      console.warn(`Unauthorized login attempt from: ${userEmail}`);
      return NextResponse.redirect(new URL("/login?error=unauthorized", publicUrl));
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
    return NextResponse.redirect(new URL("/", publicUrl));
  } catch (err) {
    console.error("Auth callback error:", err);
    return NextResponse.redirect(new URL("/login?error=auth_failed", publicUrl));
  }
}
