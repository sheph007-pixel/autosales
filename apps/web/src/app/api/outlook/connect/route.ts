import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const fwdHost = request.headers.get("x-forwarded-host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const host = fwdHost || request.headers.get("host") || "crm-production-8b2a.up.railway.app";
  const baseUrl = `${proto}://${host}`;
  return NextResponse.redirect(new URL("/api/auth/login", baseUrl));
}
