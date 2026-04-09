import { NextRequest, NextResponse } from "next/server";
import { getAuthorizationUrl } from "@autosales/mail";

export async function GET(request: NextRequest) {
  try {
    const url = getAuthorizationUrl("login");
    return NextResponse.redirect(url);
  } catch (error) {
    console.error("Failed to generate auth URL:", error);
    const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    return NextResponse.redirect(new URL("/login?error=config", baseUrl));
  }
}
