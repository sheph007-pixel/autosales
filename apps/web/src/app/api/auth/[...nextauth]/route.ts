import { NextResponse } from "next/server";

// NextAuth is no longer used. Redirect any legacy NextAuth calls.
export async function GET() {
  return NextResponse.redirect(new URL("/login", process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000"));
}

export async function POST() {
  return NextResponse.json({ error: "NextAuth is no longer used. Use /api/auth/login." }, { status: 410 });
}
