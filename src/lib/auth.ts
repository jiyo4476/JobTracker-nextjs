import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

const DEFAULT_AUTHENTIK_BASE_URL = "https://auth.yjimmy.dev";
const DEFAULT_AUTHENTIK_APP_SLUG = "job-tracker";
const DEFAULT_AUTHENTIK_TRUSTED_ISSUERS = [
  "https://auth.yjimmy.dev/application/o/job-tracker-scraper/",
  "https://auth.yjimmy.dev/application/o/job-tracker-extension/",
];

// Authentik signs tokens with RS256; pin it explicitly so a malicious token
// can't try to downgrade to a weaker/none algorithm.
const JWT_ALGORITHMS = ["RS256"];

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
//
// Same-origin browser requests (no Authorization header) are allowed through one of
// two paths:
//   - AUTHENTIK_FORWARD_AUTH_ENABLED=true (real deployments behind the Authentik
//     forward-auth outpost, e.g. Traefik ForwardAuth): every request that reaches
//     this app already passed Authentik's login wall, and the outpost injects a
//     signed `X-authentik-jwt` header as cryptographic proof of that. We verify its
//     signature against Authentik's JWKS — this cannot be forged by a client that
//     talks to the app directly, unlike a client-supplied Origin/Referer header.
//   - Otherwise (local `npm run dev` / `docker compose up`, where no such proxy sits
//     in front): fall back to a same-origin Origin/Referer check. This fallback is
//     trivially forgeable by any non-browser client that simply sets a matching
//     Origin header — it must never be relied on once a real deployment can enable
//     the JWT path instead.
export async function requireApiKey(
  req: NextRequest,
  options: RequireApiKeyOptions = {},
): Promise<boolean> {
  const allowSameOrigin = options.allowSameOrigin ?? true;
  const key = process.env.API_KEY;
  const auth = req.headers.get("authorization");

  // Temporary migration fallback for callers that have not moved to OAuth2 yet.
  // Remove API_KEY from the environment to require Authentik tokens exclusively.
  if (key && auth && safeCompare(auth, `Bearer ${key}`)) return true;

  if (allowSameOrigin && !auth) {
    if (process.env.AUTHENTIK_FORWARD_AUTH_ENABLED === "true") {
      const proxyJwt = req.headers.get("x-authentik-jwt");
      return proxyJwt ? verifyForwardAuthJwt(proxyJwt) : false;
    }

    // Local/dev fallback — only reachable when forward-auth isn't configured.
    // Parse origin URL and compare hostname+port explicitly to avoid substring spoofing
    // (e.g. "https://localhost.evil.com" containing "localhost").
    const host = req.headers.get("host") ?? ""; // "hostname:port" or "hostname"
    // Referer includes the full path (e.g. "https://localhost:3000/jobs/42");
    // new URL().host extracts just "localhost:3000" for comparison.
    const rawOrigin = req.headers.get("origin") ?? req.headers.get("referer") ?? "";
    try {
      const { host: parsedHost } = new URL(rawOrigin);
      if (host !== "" && parsedHost === host) return true;
    } catch {
      // empty or malformed origin — fall through to reject
    }
  }

  if (!auth?.startsWith("Bearer ")) return false;

  return verifyOAuthToken(auth.slice("Bearer ".length));
}

// Verifies the signed JWT that Authentik's forward-auth outpost injects as
// `X-authentik-jwt` for every request it forwards. We deliberately pin verification
// to our own statically configured issuer/JWKS (getOAuthConfig()) rather than the
// `X-authentik-meta-jwks` header the outpost also sends — trusting a header-supplied
// JWKS URL would let a client that bypasses the outpost point verification at a
// JWKS of its own choosing, defeating the whole check.
async function verifyForwardAuthJwt(token: string): Promise<boolean> {
  const config = getOAuthConfig();
  try {
    await jwtVerify(token, getJwks(config.jwksUri), {
      issuer: config.issuer,
      algorithms: JWT_ALGORITHMS,
    });
    return true;
  } catch {
    return false;
  }
}

// Constant-time string comparison to avoid leaking the shared API_KEY secret
// via response-timing differences.
function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

async function verifyOAuthToken(token: string): Promise<boolean> {
  const config = getOAuthConfig();
  for (const provider of config.providers) {
    try {
      const result = await jwtVerify(token, getJwks(provider.jwksUri), {
        issuer: provider.issuer,
        audience: config.audiences,
        algorithms: JWT_ALGORITHMS,
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
