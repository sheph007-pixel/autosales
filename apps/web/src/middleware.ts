import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET || "dev-secret-change-me"
);

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/health", "/api/webhooks"];

function resolveBaseUrl(request: NextRequest): string {
  // 1. Try x-forwarded-host (Railway proxy sets this)
  const fwdHost = request.headers.get("x-forwarded-host");
  if (fwdHost) {
    const proto = request.headers.get("x-forwarded-proto") || "https";
    return `${proto}://${fwdHost}`;
  }
  // 2. Try host header
  const host = request.headers.get("host");
  if (host && !host.startsWith("0.0.0.0") && !host.startsWith("127.0.0.1")) {
    return `https://${host}`;
  }
  // 3. APP_URL env var
  if (process.env.APP_URL) {
    return process.env.APP_URL;
  }
  // 4. Last resort — use request URL (will be internal in Railway)
  return `${request.nextUrl.protocol}//${request.nextUrl.host}`;
}

function clearAllCookies(response: NextResponse) {
  const cookieOptions = { path: "/", expires: new Date(0) };
  response.cookies.set("autosales_session", "", cookieOptions);
  response.cookies.set("next-auth.session-token", "", cookieOptions);
  response.cookies.set("__Secure-next-auth.session-token", "", cookieOptions);
  response.cookies.set("next-auth.csrf-token", "", cookieOptions);
  response.cookies.set("next-auth.callback-url", "", cookieOptions);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths and static assets
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const baseUrl = resolveBaseUrl(request);

  // Check for legacy NextAuth cookies — clear and redirect immediately
  const hasLegacyCookie =
    request.cookies.has("next-auth.session-token") ||
    request.cookies.has("__Secure-next-auth.session-token");

  if (hasLegacyCookie) {
    const response = NextResponse.redirect(new URL("/login", baseUrl));
    clearAllCookies(response);
    return response;
  }

  // Check for our session cookie
  const token = request.cookies.get("autosales_session")?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/login", baseUrl));
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (!payload.microsoftId) {
      throw new Error("Legacy token");
    }
    // Redirect root to /discover
    if (pathname === "/") {
      return NextResponse.redirect(new URL("/discover", baseUrl));
    }
    return NextResponse.next();
  } catch {
    const response = NextResponse.redirect(new URL("/login", baseUrl));
    clearAllCookies(response);
    return response;
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
