import { NextResponse } from "next/server";
import { getAuthorizationUrl } from "@autosales/mail";

export async function GET() {
  try {
    const url = getAuthorizationUrl("outlook-connect");
    return NextResponse.redirect(url);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to generate authorization URL. Check Microsoft OAuth configuration." },
      { status: 500 }
    );
  }
}
