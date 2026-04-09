import { NextResponse } from "next/server";
import { getAuthorizationUrl } from "@autosales/mail";

export async function GET() {
  try {
    const url = getAuthorizationUrl("login");
    return NextResponse.redirect(url);
  } catch (error) {
    console.error("Failed to generate auth URL:", error);
    return NextResponse.redirect(
      new URL("/login?error=config", process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000")
    );
  }
}
