import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET || "dev-secret-change-me"
);

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/health", "/api/webhooks"];

function getPublicUrl(request: NextRequest): string {
  // Railway sets x-forwarded-host with the public domain
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  // Fallback to APP_URL or request URL
  return process.env.APP_URL || request.url;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static assets
  if (pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  const publicUrl = getPublicUrl(request);

  // Check ALL possible session cookies
  const token = request.cookies.get("autosales_session")?.value;
  const legacyToken1 = request.cookies.get("next-auth.session-token")?.value;
  const legacyToken2 = request.cookies.get("__Secure-next-auth.session-token")?.value;

  // If ANY legacy cookie exists, clear everything and force login
  if (legacyToken1 || legacyToken2) {
    const response = NextResponse.redirect(new URL("/login", publicUrl));
    response.cookies.delete("autosales_session");
    response.cookies.delete("next-auth.session-token");
    response.cookies.delete("__Secure-next-auth.session-token");
    response.cookies.delete("next-auth.csrf-token");
    response.cookies.delete("next-auth.callback-url");
    return response;
  }

  if (!token) {
    return NextResponse.redirect(new URL("/login", publicUrl));
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (!payload.microsoftId) {
      throw new Error("Legacy token format");
    }
    return NextResponse.next();
  } catch {
    const response = NextResponse.redirect(new URL("/login", publicUrl));
    response.cookies.delete("autosales_session");
    return response;
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
