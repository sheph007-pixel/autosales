import { NextResponse } from "next/server";

// Outlook is now connected via the unified Microsoft login.
// Redirect to the main auth flow which handles both.
export async function GET() {
  return NextResponse.redirect(new URL("/api/auth/login", process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000"));
}
