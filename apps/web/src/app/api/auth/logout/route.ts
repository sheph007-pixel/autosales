import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

export async function GET() {
  await clearSessionCookie();
  const appUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
  return NextResponse.redirect(new URL("/login", appUrl));
}

export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
