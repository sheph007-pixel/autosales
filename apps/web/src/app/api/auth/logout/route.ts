import { NextRequest, NextResponse } from "next/server";

function clearAllCookies(response: NextResponse) {
  const cookieOptions = { path: "/", expires: new Date(0) };
  response.cookies.set("autosales_session", "", cookieOptions);
  response.cookies.set("next-auth.session-token", "", cookieOptions);
  response.cookies.set("__Secure-next-auth.session-token", "", cookieOptions);
  response.cookies.set("next-auth.csrf-token", "", cookieOptions);
  response.cookies.set("next-auth.callback-url", "", cookieOptions);
}

export async function GET(request: NextRequest) {
  // For direct browser navigation — redirect using APP_URL
  const appUrl = process.env.APP_URL || "https://crm-production-8b2a.up.railway.app";
  const response = NextResponse.redirect(new URL("/login", appUrl));
  clearAllCookies(response);
  return response;
}

export async function POST() {
  // For fetch() calls from client — return JSON with cookie clearing
  const response = NextResponse.json({ ok: true });
  clearAllCookies(response);
  return response;
}
