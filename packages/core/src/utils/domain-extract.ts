const PERSONAL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "aol.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "msn.com",
  "ymail.com",
  "protonmail.com",
  "proton.me",
  "mail.com",
  "zoho.com",
  "fastmail.com",
  "hey.com",
  "tutanota.com",
  "gmx.com",
  "gmx.net",
  "inbox.com",
  "att.net",
  "comcast.net",
  "verizon.net",
  "cox.net",
  "charter.net",
  "sbcglobal.net",
  "earthlink.net",
]);

export function extractDomain(email: string): string | null {
  const parts = email.toLowerCase().trim().split("@");
  if (parts.length !== 2) return null;
  return parts[1] ?? null;
}

export function isPersonalDomain(domain: string): boolean {
  return PERSONAL_DOMAINS.has(domain.toLowerCase());
}

export function isBusinessDomain(email: string): boolean {
  const domain = extractDomain(email);
  if (!domain) return false;
  return !isPersonalDomain(domain);
}

export function extractBusinessDomain(email: string): string | null {
  const domain = extractDomain(email);
  if (!domain) return null;
  if (isPersonalDomain(domain)) return null;
  return domain;
}

export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export function extractNameFromEmail(email: string): string {
  const localPart = email.split("@")[0];
  if (!localPart) return email;
  return localPart
    .replace(/[._-]/g, " ")
    .replace(/\d+/g, "")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
