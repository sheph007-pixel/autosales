import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "dev-secret-change-me"
);

const COOKIE_NAME = "autosales_session";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  microsoftId: string;
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({
    sub: user.id,
    email: user.email,
    name: user.name,
    microsoftId: user.microsoftId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${COOKIE_MAX_AGE}s`)
    .sign(JWT_SECRET);
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return {
      id: payload.sub as string,
      email: payload.email as string,
      name: payload.name as string,
      microsoftId: payload.microsoftId as string,
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export function isAllowedEmail(email: string): boolean {
  const allowed = process.env.ALLOWED_EMAILS;
  if (!allowed) return true; // If not configured, allow any Microsoft account
  const list = allowed.split(",").map((e) => e.trim().toLowerCase());
  return list.includes(email.toLowerCase());
}
