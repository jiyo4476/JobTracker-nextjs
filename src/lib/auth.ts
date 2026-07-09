import { NextRequest } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";

const DEFAULT_AUTHENTIK_BASE_URL = "https://auth.yjimmy.dev";
const DEFAULT_AUTHENTIK_APP_SLUG = "job-tracker";

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let jwksUri: string | undefined;

// Validates OAuth2 Bearer tokens issued by Authentik for external callers.
// Same-origin browser requests (no Authorization header + Origin/Referer matches host)
// are allowed so the web UI can call its own API after Authentik protects the app.
export async function requireApiKey(req: NextRequest): Promise<boolean> {
  const key = process.env.API_KEY;
  const auth = req.headers.get("authorization");

  // Temporary migration fallback for callers that have not moved to OAuth2 yet.
  // Remove API_KEY from the environment to require Authentik tokens exclusively.
  if (key && auth === `Bearer ${key}`) return true;

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

  if (!auth?.startsWith("Bearer ")) return false;

  return verifyOAuthToken(auth.slice("Bearer ".length));
}

async function verifyOAuthToken(token: string): Promise<boolean> {
  const config = getOAuthConfig();
  try {
    const result = await jwtVerify(token, getJwks(config.jwksUri), {
      issuer: config.issuer,
      audience: config.audience,
    });
    if (config.requiredScopes.length === 0) return true;

    const scopeClaim = result.payload.scope;
    const scopes =
      typeof scopeClaim === "string" ? scopeClaim.split(/\s+/).filter(Boolean) : [];
    return config.requiredScopes.every((scope) => scopes.includes(scope));
  } catch (err) {
    console.warn("OAuth2 bearer token verification failed:", err);
    return false;
  }
}

export function getOAuthConfig() {
  const baseUrl = (
    process.env.AUTHENTIK_BASE_URL ?? DEFAULT_AUTHENTIK_BASE_URL
  ).replace(/\/+$/, "");
  const appSlug = process.env.AUTHENTIK_APP_SLUG ?? DEFAULT_AUTHENTIK_APP_SLUG;
  const issuer =
    process.env.AUTHENTIK_ISSUER ?? `${baseUrl}/application/o/${appSlug}/`;
  const audience =
    process.env.AUTHENTIK_AUDIENCE ??
    process.env.OAUTH_CLIENT_ID ??
    DEFAULT_AUTHENTIK_APP_SLUG;
  const requiredScopes = (process.env.AUTHENTIK_REQUIRED_SCOPES ?? "")
    .split(/\s+/)
    .filter(Boolean);

  return {
    issuer,
    audience,
    requiredScopes,
    jwksUri:
      process.env.AUTHENTIK_JWKS_URI ??
      `${baseUrl}/application/o/${appSlug}/jwks/`,
  };
}

function getJwks(uri: string) {
  if (!jwks || jwksUri !== uri) {
    jwksUri = uri;
    jwks = createRemoteJWKSet(new URL(uri));
  }
  return jwks;
}
