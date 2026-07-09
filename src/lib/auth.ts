import { NextRequest } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";

const DEFAULT_AUTHENTIK_BASE_URL = "https://auth.yjimmy.dev";
const DEFAULT_AUTHENTIK_APP_SLUG = "job-tracker";
const DEFAULT_AUTHENTIK_TRUSTED_ISSUERS = [
  "https://auth.yjimmy.dev/application/o/job-tracker-scraper/",
  "https://auth.yjimmy.dev/application/o/job-tracker-extension/",
  "https://auth.yjimmy.dev/application/o/job-tracker-scraper/",
];

const jwksByUri = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

type RequireApiKeyOptions = {
  allowSameOrigin?: boolean;
};

type IntrospectionResponse = {
  active?: boolean;
  iss?: string;
  aud?: string | string[];
  client_id?: string;
  scope?: string;
};

// Validates OAuth2 Bearer tokens issued by Authentik for external callers.
// Same-origin browser requests (no Authorization header + Origin/Referer matches host)
// are allowed so the web UI can call its own API after Authentik protects the app.
export async function requireApiKey(
  req: NextRequest,
  options: RequireApiKeyOptions = {},
): Promise<boolean> {
  const allowSameOrigin = options.allowSameOrigin ?? true;
  const key = process.env.API_KEY;
  const auth = req.headers.get("authorization");

  // Temporary migration fallback for callers that have not moved to OAuth2 yet.
  // Remove API_KEY from the environment to require Authentik tokens exclusively.
  if (key && auth === `Bearer ${key}`) return true;

  // Allow same-origin browser requests that carry no auth header.
  // Parse origin URL and compare hostname+port explicitly to avoid substring spoofing
  // (e.g. "https://localhost.evil.com" containing "localhost").
  if (allowSameOrigin && !auth) {
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
  for (const provider of config.providers) {
    try {
      const result = await jwtVerify(token, getJwks(provider.jwksUri), {
        issuer: provider.issuer,
        audience: config.audiences,
      });
      if (config.requiredScopes.length === 0) return true;

      const scopeClaim = result.payload.scope;
      const scopes =
        typeof scopeClaim === "string" ? scopeClaim.split(/\s+/).filter(Boolean) : [];
      return config.requiredScopes.every((scope) => scopes.includes(scope));
    } catch {
      // Try the next trusted issuer/JWKS pair.
    }
  }

  return verifyTokenByIntrospection(token, config);
}

export function getOAuthConfig() {
  const baseUrl = (
    process.env.AUTHENTIK_BASE_URL ?? DEFAULT_AUTHENTIK_BASE_URL
  ).replace(/\/+$/, "");
  const appSlug = process.env.AUTHENTIK_APP_SLUG ?? DEFAULT_AUTHENTIK_APP_SLUG;
  const issuer =
    normalizeIssuer(process.env.AUTHENTIK_ISSUER ?? `${baseUrl}/application/o/${appSlug}/`);
  const audiences = unique([
    ...splitEnvList(process.env.AUTHENTIK_AUDIENCES),
    process.env.AUTHENTIK_AUDIENCE,
    process.env.OAUTH_CLIENT_ID,
    DEFAULT_AUTHENTIK_APP_SLUG,
    ...getTrustedIssuers(baseUrl).map((trustedIssuer) =>
      issuerToAppSlug(trustedIssuer),
    ),
  ]);
  const requiredScopes = (process.env.AUTHENTIK_REQUIRED_SCOPES ?? "")
    .split(/\s+/)
    .filter(Boolean);
  const providers = getTrustedIssuers(baseUrl).map((trustedIssuer) => ({
    issuer: trustedIssuer,
    jwksUri: `${trustedIssuer}jwks/`,
  }));
  if (process.env.AUTHENTIK_ISSUER || process.env.AUTHENTIK_JWKS_URI) {
    providers.unshift({
      issuer,
      jwksUri:
        process.env.AUTHENTIK_JWKS_URI ??
        `${issuer}jwks/`,
    });
  }
  const uniqueProviders = uniqueBy(providers, (provider) => provider.issuer);

  return {
    issuer: uniqueProviders[0]?.issuer ?? issuer,
    audience: audiences[0] ?? DEFAULT_AUTHENTIK_APP_SLUG,
    audiences,
    providers: uniqueProviders,
    requiredScopes,
    jwksUri: uniqueProviders[0]?.jwksUri ?? `${issuer}jwks/`,
    introspectionUri:
      process.env.AUTHENTIK_INTROSPECTION_URI ??
      `${baseUrl}/application/o/introspect/`,
    introspectionClientId:
      process.env.AUTHENTIK_INTROSPECTION_CLIENT_ID ??
      process.env.OAUTH_CLIENT_ID ??
      "",
    introspectionClientSecret:
      process.env.AUTHENTIK_INTROSPECTION_CLIENT_SECRET ??
      process.env.OAUTH_CLIENT_SECRET ??
      "",
  };
}

async function verifyTokenByIntrospection(
  token: string,
  config: ReturnType<typeof getOAuthConfig>,
): Promise<boolean> {
  if (!config.introspectionClientId || !config.introspectionClientSecret) {
    return false;
  }

  try {
    const credentials = Buffer.from(
      `${config.introspectionClientId}:${config.introspectionClientSecret}`,
    ).toString("base64");
    const body = new URLSearchParams({ token });
    const response = await fetch(config.introspectionUri, {
      method: "POST",
      headers: {
        authorization: `Basic ${credentials}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!response.ok) return false;

    const data = (await response.json()) as IntrospectionResponse;
    if (!data.active) return false;

    const trustedIssuers = new Set(
      config.providers.map((provider) => provider.issuer),
    );
    if (!data.iss || !trustedIssuers.has(normalizeIssuer(data.iss))) {
      return false;
    }

    const tokenAudiences = Array.isArray(data.aud) ? data.aud : [data.aud];
    if (
      !tokenAudiences.some(
        (audience) => audience && config.audiences.includes(audience),
      )
    ) {
      return false;
    }

    if (config.requiredScopes.length === 0) return true;

    const scopes =
      typeof data.scope === "string" ? data.scope.split(/\s+/).filter(Boolean) : [];
    return config.requiredScopes.every((scope) => scopes.includes(scope));
  } catch {
    return false;
  }
}

function getJwks(uri: string) {
  let jwks = jwksByUri.get(uri);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(uri));
    jwksByUri.set(uri, jwks);
  }
  return jwks;
}

function getTrustedIssuers(baseUrl: string): string[] {
  const configured = splitEnvList(process.env.AUTHENTIK_TRUSTED_ISSUERS);
  return unique(
    (configured.length > 0 ? configured : DEFAULT_AUTHENTIK_TRUSTED_ISSUERS).map(
      (issuer) => normalizeIssuer(issuer.replace("${AUTHENTIK_BASE_URL}", baseUrl)),
    ),
  );
}

function splitEnvList(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeIssuer(value: string): string {
  return value.replace(/\/+$/, "") + "/";
}

function issuerToAppSlug(issuer: string): string {
  const parts = normalizeIssuer(issuer).split("/").filter(Boolean);
  return parts.at(-1) ?? DEFAULT_AUTHENTIK_APP_SLUG;
}

function unique(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function uniqueBy<T>(values: T[], getKey: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = getKey(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
