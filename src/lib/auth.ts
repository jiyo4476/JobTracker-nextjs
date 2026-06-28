import { NextRequest } from "next/server";

// Validates Bearer token on mutating API routes.
// Same-origin browser requests (no Authorization header + Origin/Referer matches host)
// are always allowed — the token is only required for external callers like the scraper.
export function requireApiKey(req: NextRequest): boolean {
  const key = process.env.API_KEY;
  if (!key) return true; // no key configured → open access

  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${key}`) return true;

  // Allow same-origin browser requests that carry no auth header
  if (!auth) {
    const host = req.headers.get("host") ?? "";
    const origin = req.headers.get("origin") ?? req.headers.get("referer") ?? "";
    if (origin === "" || (host !== "" && origin.includes(host))) return true;
  }

  return false;
}
