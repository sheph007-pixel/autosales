import { NextRequest, NextResponse } from "next/server";
import { getAuthorizationUrl } from "@autosales/mail";

function getPublicUrl(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  return process.env.APP_URL || `${request.nextUrl.protocol}//${request.nextUrl.host}`;
}

export async function GET(request: NextRequest) {
  try {
    const url = getAuthorizationUrl("login");
    return NextResponse.redirect(url);
  } catch (error) {
    console.error("Failed to generate auth URL:", error);
    return NextResponse.redirect(new URL("/login?error=config", getPublicUrl(request)));
  }
}
