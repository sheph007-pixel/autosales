import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

export async function GET(request: NextRequest) {
  await clearSessionCookie();
  const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
  return NextResponse.redirect(new URL("/login", baseUrl));
}

export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
