import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "dev-secret-change-me"
);

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/health", "/api/webhooks"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check for our session cookie
  const token = request.cookies.get("autosales_session")?.value;

  if (!token) {
    // Clear any legacy NextAuth cookies and redirect
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("next-auth.session-token");
    response.cookies.delete("__Secure-next-auth.session-token");
    response.cookies.delete("next-auth.csrf-token");
    response.cookies.delete("next-auth.callback-url");
    return response;
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    // Verify this is our new auth format (has microsoftId claim)
    if (!payload.microsoftId) {
      throw new Error("Legacy token format");
    }
    return NextResponse.next();
  } catch {
    // Invalid/expired/legacy token — clear everything and redirect
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("autosales_session");
    response.cookies.delete("next-auth.session-token");
    response.cookies.delete("__Secure-next-auth.session-token");
    response.cookies.delete("next-auth.csrf-token");
    response.cookies.delete("next-auth.callback-url");
    return response;
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
