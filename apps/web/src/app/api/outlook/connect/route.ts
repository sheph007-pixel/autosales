import { NextRequest, NextResponse } from "next/server";

// Outlook is now connected via the unified Microsoft login.
export async function GET(request: NextRequest) {
  const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
  return NextResponse.redirect(new URL("/api/auth/login", baseUrl));
}
