import { NextRequest } from "next/server";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { logger } from "@/lib/logger";

// Authentik is the default provider for this deployment, but every value below is
// overridable so the app can front ANY OAuth2/OIDC provider (Auth0, Keycloak, Okta,
// Cognito, Google, …). Prefer the provider-neutral OIDC_* env vars; the AUTHENTIK_*
// (and OAUTH_*) names are kept as fallbacks so existing deployments keep working.
const DEFAULT_AUTHENTIK_BASE_URL = "https://auth.yjimmy.dev";
const DEFAULT_AUTHENTIK_APP_SLUG = "job-tracker";
const DEFAULT_AUTHENTIK_TRUSTED_ISSUERS = [
  "https://auth.yjimmy.dev/application/o/job-tracker-scraper/",
  "https://auth.yjimmy.dev/application/o/job-tracker-extension/",
];
const DEFAULT_AUTHENTIK_SERVICE_ISSUERS = [
  "https://auth.yjimmy.dev/application/o/job-tracker-scraper/",
];

// Most OIDC providers sign with RS256; pin allowed algorithms explicitly so a
// malicious token can't downgrade to a weaker/`none` algorithm. Providers that use a
// different family (e.g. ES256/PS256) set OIDC_JWT_ALGORITHMS.
const DEFAULT_JWT_ALGORITHMS = ["RS256"];

// OIDC_JWT_ALGORITHMS is operator-supplied, so validate it against this allow-list of
// asymmetric signature algorithms. JWKS verification pairs a public key with the token
// signature; symmetric (HS*) algorithms and `none` must never be accepted even if
// misconfigured, since they would let a caller forge tokens against a published key.
const ALLOWED_JWT_ALGORITHMS = new Set([
  "RS256", "RS384", "RS512",
  "PS256", "PS384", "PS512",
  "ES256", "ES384", "ES512",
  "EdDSA",
]);

// Warn at most once per distinct rejected algorithm so a misconfiguration is visible
// without spamming logs on every request (getOAuthConfig runs per request).
const warnedUnsupportedAlgorithms = new Set<string>();

// Authentik's forward-auth outpost injects its signed JWT as `X-authentik-jwt`.
// Other reverse-proxy/OIDC setups can override the header name via OIDC_FORWARD_AUTH_HEADER.
const DEFAULT_FORWARD_AUTH_HEADER = "x-authentik-jwt";

const jwksByUri = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

type RequireAuthenticationOptions = {
  allowSameOrigin?: boolean;
  principal?: "user" | "ingestion";
};

type IntrospectionResponse = {
  active?: boolean;
  iss?: string;
  aud?: string | string[];
  client_id?: string;
  scope?: string;
  sub?: string;
};

export type AuthCapability = "jobs:ingest";

type VerifiedIdentity = {
  issuer: string;
  subject: string;
  scopes: string[];
  method: "bearer" | "forward-auth" | "development";
};

export type UserPrincipal = VerifiedIdentity & {
  kind: "user";
  identityKey: string;
  correlationId: string;
};

export type ServicePrincipal = VerifiedIdentity & {
  kind: "service";
  identityKey: string;
  capabilities: AuthCapability[];
  correlationId: string;
};

export type AuthPrincipal = UserPrincipal | ServicePrincipal;

export class AuthenticationError extends Error {
  constructor(
    public readonly code:
      | "unauthenticated"
      | "wrong_principal"
      | "missing_capability"
      | "inactive_user",
    public readonly correlationId: string,
  ) {
    super(code);
    this.name = "AuthenticationError";
  }
}

// Validates OAuth2 Bearer tokens issued by Authentik for external callers.
//
// Same-origin browser requests (no Authorization header) are allowed through one of
// two paths:
//   - Forward-auth enabled (OIDC_/AUTHENTIK_FORWARD_AUTH_ENABLED=true): real deployments
//     behind a forward-auth outpost, e.g. Traefik ForwardAuth. Every request that reaches
//     this app already passed the provider's login wall, and the outpost injects a
//     signed JWT header (name from OIDC_FORWARD_AUTH_HEADER, default `x-authentik-jwt`)
//     as cryptographic proof of that. We verify its
//     signature against the provider's JWKS — this cannot be forged by a client that
//     talks to the app directly, unlike a client-supplied Origin/Referer header.
//   - Otherwise (local `npm run dev` / `docker compose up`, where no such proxy sits
//     in front): fall back to a same-origin Origin/Referer check. This fallback is
//     trivially forgeable by any non-browser client that simply sets a matching
//     Origin header — it must never be relied on once a real deployment can enable
//     the JWT path instead.
export async function requireAuthentication(
  req: NextRequest,
  options: RequireAuthenticationOptions = {},
): Promise<boolean> {
  const principal = await authenticateRequest(req, options);
  const allowed = principal
    ? (options.principal ?? "user") === "user"
      ? principal.kind === "user"
      : principal.kind === "user" || principal.capabilities.includes("jobs:ingest")
    : false;
  if (!allowed) {
    logAuthenticationRejection(
      principal ? "wrong_principal" : "unauthenticated",
      principal?.correlationId ?? getCorrelationId(req),
      principal ?? undefined,
    );
  }
  return allowed;
}

export async function authenticateRequest(
  req: NextRequest,
  options: RequireAuthenticationOptions = {},
): Promise<AuthPrincipal | null> {
  const allowSameOrigin = options.allowSameOrigin ?? true;
  const auth = req.headers.get("authorization");
  const correlationId = getCorrelationId(req);

  if (allowSameOrigin && !auth) {
    const config = getOAuthConfig();
    if (config.forwardAuthEnabled) {
      const proxyJwt = req.headers.get(config.forwardAuthHeader);
      const identity = proxyJwt ? await verifyForwardAuthJwt(proxyJwt) : null;
      return identity ? toPrincipal(identity, correlationId, false) : null;
    }

    // Explicit local-only fallback. NODE_ENV prevents this switch from weakening
    // a production deployment even if AUTH_DEV_ALLOW_SAME_ORIGIN is set by mistake.
    if (
      process.env.NODE_ENV !== "production" &&
      process.env.AUTH_DEV_ALLOW_SAME_ORIGIN === "true" &&
      isSameOrigin(req)
    ) {
      const issuer = process.env.AUTH_DEV_ISSUER;
      const subject = process.env.AUTH_DEV_SUBJECT;
      if (issuer && subject) {
        return toPrincipal(
          { issuer: normalizeIssuer(issuer), subject, scopes: [], method: "development" },
          correlationId,
          false,
        );
      }
    }
  }

  if (!auth?.startsWith("Bearer ")) return null;

  const identity = await verifyOAuthToken(auth.slice("Bearer ".length));
  return identity ? toPrincipal(identity, correlationId, true) : null;
}

export async function requireUser(req: NextRequest): Promise<UserPrincipal> {
  const principal = await authenticateRequest(req);
  if (!principal) throwAuth(req, "unauthenticated");
  if (principal.kind !== "user") throwAuth(req, "wrong_principal", principal);
  return principal;
}

export async function requireServicePrincipal(
  req: NextRequest,
  capability: AuthCapability,
): Promise<ServicePrincipal> {
  const principal = await authenticateRequest(req, { allowSameOrigin: false });
  if (!principal) throwAuth(req, "unauthenticated");
  if (principal.kind !== "service") throwAuth(req, "wrong_principal", principal);
  if (!principal.capabilities.includes(capability)) {
    throwAuth(req, "missing_capability", principal);
  }
  return principal;
}

function isSameOrigin(req: NextRequest): boolean {
    // Parse origin URL and compare hostname+port explicitly to avoid substring spoofing
    // (e.g. "https://localhost.evil.com" containing "localhost").
    const host = req.headers.get("host") ?? ""; // "hostname:port" or "hostname"
    // Referer includes the full path (e.g. "https://localhost:3000/jobs/42");
    // new URL().host extracts just "localhost:3000" for comparison.
    const rawOrigin = req.headers.get("origin") ?? req.headers.get("referer") ?? "";
    try {
      const { host: parsedHost } = new URL(rawOrigin);
      return host !== "" && parsedHost === host;
    } catch {
      return false;
    }
}

function throwAuth(
  req: NextRequest,
  code: AuthenticationError["code"],
  principal?: AuthPrincipal,
): never {
  const correlationId = principal?.correlationId ?? getCorrelationId(req);
  logAuthenticationRejection(code, correlationId, principal);
  throw new AuthenticationError(code, correlationId);
}

function logAuthenticationRejection(
  code: AuthenticationError["code"],
  correlationId: string,
  principal?: AuthPrincipal,
): void {
  logger.warn("authentication rejected", {
    correlationId,
    code,
    issuer: principal?.issuer,
    subject: principal?.subject,
    principalKind: principal?.kind,
  });
}

// Verifies the signed JWT that Authentik's forward-auth outpost injects as
// `X-authentik-jwt` for every request it forwards. We deliberately pin verification
// to our own statically configured issuer/JWKS (getOAuthConfig()) rather than the
// `X-authentik-meta-jwks` header the outpost also sends — trusting a header-supplied
// JWKS URL would let a client that bypasses the outpost point verification at a
// JWKS of its own choosing, defeating the whole check.
//
// The outpost issues this JWT per-proxy-provider via a standard OAuth2 flow (Authentik
// docs: "the token must be a JWT token issued for the proxy provider"), so it carries an
// `aud` claim scoped to job-tracker's own provider — same as any other Authentik-issued
// token for this app. We check it against config.audiences for the same reason
// verifyOAuthToken does: without it, a JWT minted for a *different* application behind
// the same Authentik instance/JWKS would also verify here if this backend were ever
// reachable by a path that skips the Traefik ForwardAuth hop.
async function verifyForwardAuthJwt(token: string): Promise<VerifiedIdentity | null> {
  const config = getOAuthConfig();
  try {
    const result = await jwtVerify(token, getJwks(config.jwksUri), {
      issuer: config.issuer,
      audience: config.audiences,
      algorithms: config.algorithms,
    });
    const identity = identityFromPayload(result.payload, "forward-auth");
    if (!identity) return null;
    return config.requiredScopes.every((scope) => identity.scopes.includes(scope))
      ? identity
      : null;
  } catch {
    return null;
  }
}

async function verifyOAuthToken(token: string): Promise<VerifiedIdentity | null> {
  const config = getOAuthConfig();
  for (const provider of config.providers) {
    try {
      const result = await jwtVerify(token, getJwks(provider.jwksUri), {
        issuer: provider.issuer,
        audience: config.audiences,
        algorithms: config.algorithms,
      });
      const identity = identityFromPayload(result.payload, "bearer");
      if (!identity) return null;
      return config.requiredScopes.every((scope) => identity.scopes.includes(scope))
        ? identity
        : null;
    } catch {
      // Try the next trusted issuer/JWKS pair.
    }
  }

  return verifyTokenByIntrospection(token, config);
}

export function getOAuthConfig() {
  const baseUrl = (
    envAny("OIDC_BASE_URL", "AUTHENTIK_BASE_URL") ?? DEFAULT_AUTHENTIK_BASE_URL
  ).replace(/\/+$/, "");
  const appSlug =
    envAny("OIDC_APP_SLUG", "AUTHENTIK_APP_SLUG") ?? DEFAULT_AUTHENTIK_APP_SLUG;
  const explicitIssuer = envAny("OIDC_ISSUER", "AUTHENTIK_ISSUER");
  const explicitJwksUri = envAny("OIDC_JWKS_URI", "AUTHENTIK_JWKS_URI");
  // A generic provider supplies OIDC_ISSUER directly; the Authentik-style
  // `${baseUrl}/application/o/${slug}/` shape is only the zero-config fallback.
  const issuer = normalizeIssuer(
    explicitIssuer ?? `${baseUrl}/application/o/${appSlug}/`,
  );
  const audiences = unique([
    ...splitEnvList(envAny("OIDC_AUDIENCES", "AUTHENTIK_AUDIENCES")),
    envAny("OIDC_AUDIENCE", "AUTHENTIK_AUDIENCE"),
    process.env.OAUTH_CLIENT_ID,
    DEFAULT_AUTHENTIK_APP_SLUG,
    ...getTrustedIssuers(baseUrl).map((trustedIssuer) =>
      issuerToAppSlug(trustedIssuer),
    ),
  ]);
  const requiredScopes = splitEnvList(
    envAny("OIDC_REQUIRED_SCOPES", "AUTHENTIK_REQUIRED_SCOPES"),
  );
  const algorithms = (() => {
    const configured = splitEnvList(envAny("OIDC_JWT_ALGORITHMS")).filter((alg) => {
      if (ALLOWED_JWT_ALGORITHMS.has(alg)) return true;
      if (!warnedUnsupportedAlgorithms.has(alg)) {
        warnedUnsupportedAlgorithms.add(alg);
        logger.warn("ignoring unsupported JWT algorithm", {
          code: "auth_jwt_algorithm_unsupported",
          variable: "OIDC_JWT_ALGORITHMS",
          algorithm: alg,
        });
      }
      return false;
    });
    return configured.length > 0 ? configured : DEFAULT_JWT_ALGORITHMS;
  })();
  const providers = getTrustedIssuers(baseUrl).map((trustedIssuer) => ({
    issuer: trustedIssuer,
    jwksUri: `${trustedIssuer}jwks/`,
  }));
  // The primary provider is only added when an issuer/JWKS is explicitly set, so a
  // pure trusted-issuers deployment isn't polluted with the Authentik default host.
  if (explicitIssuer || explicitJwksUri) {
    providers.unshift({
      issuer,
      jwksUri: explicitJwksUri ?? `${issuer}jwks/`,
    });
  }
  const uniqueProviders = uniqueBy(providers, (provider) => provider.issuer);

  return {
    issuer: uniqueProviders[0]?.issuer ?? issuer,
    audience: audiences[0] ?? DEFAULT_AUTHENTIK_APP_SLUG,
    audiences,
    providers: uniqueProviders,
    requiredScopes,
    algorithms,
    forwardAuthEnabled:
      envAny("OIDC_FORWARD_AUTH_ENABLED", "AUTHENTIK_FORWARD_AUTH_ENABLED") === "true",
    forwardAuthHeader: (
      envAny("OIDC_FORWARD_AUTH_HEADER") ?? DEFAULT_FORWARD_AUTH_HEADER
    ).toLowerCase(),
    jwksUri: uniqueProviders[0]?.jwksUri ?? explicitJwksUri ?? `${issuer}jwks/`,
    introspectionUri:
      envAny("OIDC_INTROSPECTION_URI", "AUTHENTIK_INTROSPECTION_URI") ??
      `${baseUrl}/application/o/introspect/`,
    introspectionClientId:
      envAny(
        "OIDC_INTROSPECTION_CLIENT_ID",
        "AUTHENTIK_INTROSPECTION_CLIENT_ID",
        "OAUTH_CLIENT_ID",
      ) ?? "",
    introspectionClientSecret:
      envAny(
        "OIDC_INTROSPECTION_CLIENT_SECRET",
        "AUTHENTIK_INTROSPECTION_CLIENT_SECRET",
        "OAUTH_CLIENT_SECRET",
      ) ?? "",
  };
}

async function verifyTokenByIntrospection(
  token: string,
  config: ReturnType<typeof getOAuthConfig>,
): Promise<VerifiedIdentity | null> {
  if (!config.introspectionClientId || !config.introspectionClientSecret) {
    return null;
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
    if (!response.ok) return null;

    const data = (await response.json()) as IntrospectionResponse;
    if (!data.active) return null;

    const trustedIssuers = new Set(
      config.providers.map((provider) => provider.issuer),
    );
    if (!data.iss || !trustedIssuers.has(normalizeIssuer(data.iss))) {
      return null;
    }

    const tokenAudiences = Array.isArray(data.aud) ? data.aud : [data.aud];
    if (
      !tokenAudiences.some(
        (audience) => audience && config.audiences.includes(audience),
      )
    ) {
      return null;
    }

    const scopes =
      typeof data.scope === "string" ? data.scope.split(/\s+/).filter(Boolean) : [];
    if (!config.requiredScopes.every((scope) => scopes.includes(scope))) return null;
    if (!data.iss || !data.sub?.trim()) return null;
    return {
      issuer: normalizeIssuer(data.iss),
      subject: data.sub,
      scopes,
      method: "bearer",
    };
  } catch {
    return null;
  }
}

function identityFromPayload(
  payload: JWTPayload,
  method: VerifiedIdentity["method"],
): VerifiedIdentity | null {
  if (typeof payload.iss !== "string" || typeof payload.sub !== "string" || !payload.sub.trim()) {
    return null;
  }
  const scopes = typeof payload.scope === "string"
    ? payload.scope.split(/\s+/).filter(Boolean)
    : [];
  return {
    issuer: normalizeIssuer(payload.iss),
    subject: payload.sub,
    scopes,
    method,
  };
}

function toPrincipal(
  identity: VerifiedIdentity,
  correlationId: string,
  allowService: boolean,
): AuthPrincipal {
  const identityKey = `${identity.issuer}#${encodeURIComponent(identity.subject)}`;
  const service = allowService ? getServicePrincipal(identity) : null;
  return service
    ? { ...identity, ...service, kind: "service", identityKey, correlationId }
    : { ...identity, kind: "user", identityKey, correlationId };
}

function getServicePrincipal(
  identity: VerifiedIdentity,
): { capabilities: AuthCapability[] } | null {
  const raw = process.env.AUTHENTIK_SERVICE_PRINCIPALS;
  if (raw) {
    try {
      const configured = JSON.parse(raw) as unknown;
      if (Array.isArray(configured)) {
        for (const item of configured) {
          if (!item || typeof item !== "object") continue;
          const record = item as Record<string, unknown>;
          if (
            typeof record.issuer === "string" &&
            normalizeIssuer(record.issuer) === identity.issuer &&
            record.subject === identity.subject &&
            Array.isArray(record.capabilities)
          ) {
            const capabilities = record.capabilities.filter(
              (value): value is AuthCapability => value === "jobs:ingest",
            );
            return { capabilities };
          }
        }
      } else {
        logServicePrincipalConfigurationWarning("not_array");
      }
    } catch {
      logServicePrincipalConfigurationWarning("invalid_json");
    }
  }
  const serviceIssuers = splitEnvList(process.env.AUTHENTIK_SERVICE_ISSUERS);
  const classifiedIssuers = serviceIssuers.length > 0
    ? serviceIssuers
    : DEFAULT_AUTHENTIK_SERVICE_ISSUERS;
  if (classifiedIssuers.map(normalizeIssuer).includes(identity.issuer)) {
    return { capabilities: [] };
  }
  return null;
}

function logServicePrincipalConfigurationWarning(
  reason: "invalid_json" | "not_array",
): void {
  // Never include the raw environment value: it is deployment configuration and
  // may contain sensitive identity metadata.
  logger.warn("invalid Authentik service-principal configuration", {
    code: "auth_service_principal_config_invalid",
    variable: "AUTHENTIK_SERVICE_PRINCIPALS",
    reason,
  });
}

function getCorrelationId(req: NextRequest): string {
  const supplied = req.headers.get("x-request-id")?.trim();
  return supplied && /^[A-Za-z0-9._:-]{1,128}$/.test(supplied)
    ? supplied
    : crypto.randomUUID();
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
  const configured = splitEnvList(
    envAny("OIDC_TRUSTED_ISSUERS", "AUTHENTIK_TRUSTED_ISSUERS"),
  );
  return unique(
    (configured.length > 0 ? configured : DEFAULT_AUTHENTIK_TRUSTED_ISSUERS).map(
      (issuer) =>
        normalizeIssuer(
          issuer
            .replace("${OIDC_BASE_URL}", baseUrl)
            .replace("${AUTHENTIK_BASE_URL}", baseUrl),
        ),
    ),
  );
}

// Returns the first environment variable that is set (non-empty after trimming),
// letting provider-neutral OIDC_* names take precedence over legacy AUTHENTIK_*/OAUTH_*.
function envAny(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value.trim() !== "") return value;
  }
  return undefined;
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
