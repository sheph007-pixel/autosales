import { NextRequest, NextResponse } from "next/server";

function getPublicUrl(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  return process.env.APP_URL || `${request.nextUrl.protocol}//${request.nextUrl.host}`;
}

export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/api/auth/login", getPublicUrl(request)));
}
