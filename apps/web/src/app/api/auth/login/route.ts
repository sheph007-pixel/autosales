import { NextRequest, NextResponse } from "next/server";
import { getAuthorizationUrl } from "@autosales/mail";

function resolveBaseUrl(request: NextRequest): string {
  const fwdHost = request.headers.get("x-forwarded-host");
  if (fwdHost) {
    const proto = request.headers.get("x-forwarded-proto") || "https";
    return `${proto}://${fwdHost}`;
  }
  const host = request.headers.get("host");
  if (host && !host.startsWith("0.0.0.0") && !host.startsWith("127.0.0.1")) {
    return `https://${host}`;
  }
  return process.env.APP_URL || "https://crm-production-8b2a.up.railway.app";
}

export async function GET(request: NextRequest) {
  try {
    const url = getAuthorizationUrl("login");
    return NextResponse.redirect(url);
  } catch (error) {
    console.error("Failed to generate auth URL:", error);
    return NextResponse.redirect(new URL("/login?error=config", resolveBaseUrl(request)));
  }
}
