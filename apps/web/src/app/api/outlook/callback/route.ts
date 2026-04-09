import { NextRequest, NextResponse } from "next/server";

// OAuth callback is now handled by /api/auth/callback.
// Redirect there in case the old URL is still configured in Azure.
export async function GET(request: NextRequest) {
  const url = new URL("/api/auth/callback", request.url);
  url.search = request.nextUrl.search;
  return NextResponse.redirect(url);
}
