import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

function getPublicUrl(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  return process.env.APP_URL || `${request.nextUrl.protocol}//${request.nextUrl.host}`;
}

export async function GET(request: NextRequest) {
  await clearSessionCookie();
  const response = NextResponse.redirect(new URL("/login", getPublicUrl(request)));
  // Clear all possible cookies
  response.cookies.delete("autosales_session");
  response.cookies.delete("next-auth.session-token");
  response.cookies.delete("__Secure-next-auth.session-token");
  response.cookies.delete("next-auth.csrf-token");
  response.cookies.delete("next-auth.callback-url");
  return response;
}

export async function POST(request: NextRequest) {
  await clearSessionCookie();
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("autosales_session");
  response.cookies.delete("next-auth.session-token");
  response.cookies.delete("__Secure-next-auth.session-token");
  return response;
}
