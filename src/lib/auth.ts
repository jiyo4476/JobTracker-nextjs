import { NextRequest } from "next/server";

// Validates Bearer token on mutating API routes.
// Same-origin browser requests (no Authorization header + Origin/Referer matches host)
// are always allowed — the token is only required for external callers like the scraper.
export function requireApiKey(req: NextRequest): boolean {
  const key = process.env.API_KEY;
  if (!key) return true; // no key configured → open access

  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${key}`) return true;

  // Allow same-origin browser requests that carry no auth header.
  // Parse origin URL and compare hostname+port explicitly to avoid substring spoofing
  // (e.g. "https://localhost.evil.com" containing "localhost").
  if (!auth) {
    const host = req.headers.get("host") ?? ""; // "hostname:port" or "hostname"
    // Referer includes the full path (e.g. "https://localhost:3000/jobs/42");
    // new URL().host extracts just "localhost:3000" for comparison.
    const rawOrigin = req.headers.get("origin") ?? req.headers.get("referer") ?? "";
    if (rawOrigin === "") return true; // no origin → same-server request (e.g. RSC fetch)
    try {
      const { host: parsedHost } = new URL(rawOrigin);
      if (host !== "" && parsedHost === host) return true;
    } catch {
      // malformed origin — fall through to reject
    }
  }

  return false;
}
