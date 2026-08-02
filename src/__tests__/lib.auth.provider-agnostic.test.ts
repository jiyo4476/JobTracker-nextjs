import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Mock jose so we can assert verification is driven by provider-neutral config,
// independent of any real JWKS network call.
vi.mock('jose', () => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => vi.fn()),
}))

import { jwtVerify } from 'jose'
import { requireAuthentication, getOAuthConfig } from '@/lib/auth'

// A deliberately non-Authentik provider (Keycloak-style issuer + explicit JWKS URI).
const GENERIC_ENV = {
  OIDC_ISSUER: 'https://id.acme.example/realms/jobs/',
  OIDC_JWKS_URI: 'https://id.acme.example/realms/jobs/protocol/openid-connect/certs',
  OIDC_AUDIENCE: 'job-tracker-api',
}

const OIDC_KEYS = [
  'OIDC_BASE_URL', 'OIDC_APP_SLUG', 'OIDC_ISSUER', 'OIDC_JWKS_URI',
  'OIDC_AUDIENCE', 'OIDC_AUDIENCES', 'OIDC_TRUSTED_ISSUERS', 'OIDC_REQUIRED_SCOPES',
  'OIDC_JWT_ALGORITHMS', 'OIDC_FORWARD_AUTH_ENABLED', 'OIDC_FORWARD_AUTH_HEADER',
  'OIDC_INTROSPECTION_URI', 'OIDC_INTROSPECTION_CLIENT_ID', 'OIDC_INTROSPECTION_CLIENT_SECRET',
  'AUTHENTIK_BASE_URL', 'AUTHENTIK_APP_SLUG', 'AUTHENTIK_ISSUER', 'AUTHENTIK_JWKS_URI',
  'AUTHENTIK_AUDIENCE', 'AUTHENTIK_AUDIENCES', 'AUTHENTIK_TRUSTED_ISSUERS',
  'AUTHENTIK_REQUIRED_SCOPES', 'AUTHENTIK_FORWARD_AUTH_ENABLED',
  'AUTHENTIK_INTROSPECTION_URI', 'AUTHENTIK_INTROSPECTION_CLIENT_ID',
  'AUTHENTIK_INTROSPECTION_CLIENT_SECRET', 'OAUTH_CLIENT_ID', 'OAUTH_CLIENT_SECRET',
]

function clearAuthEnv() {
  for (const key of OIDC_KEYS) delete process.env[key]
}

describe('provider-agnostic OAuth2/OIDC configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearAuthEnv()
  })

  afterEach(() => {
    clearAuthEnv()
    vi.unstubAllGlobals()
  })

  it('derives issuer, JWKS URI and audience from provider-neutral OIDC_* vars', () => {
    for (const [k, v] of Object.entries(GENERIC_ENV)) process.env[k] = v

    const config = getOAuthConfig()

    expect(config.issuer).toBe(GENERIC_ENV.OIDC_ISSUER)
    expect(config.jwksUri).toBe(GENERIC_ENV.OIDC_JWKS_URI)
    // Verification consumes the `audiences` array, so assert against it rather than the
    // incidental singular `audience` (audiences[0]) alias.
    expect(config.audiences).toContain(GENERIC_ENV.OIDC_AUDIENCE)
    expect(config.providers[0]).toEqual({
      issuer: GENERIC_ENV.OIDC_ISSUER,
      jwksUri: GENERIC_ENV.OIDC_JWKS_URI,
    })
  })

  it('lets OIDC_* take precedence over legacy AUTHENTIK_* values', () => {
    process.env.AUTHENTIK_ISSUER = 'https://auth.yjimmy.dev/application/o/job-tracker/'
    process.env.AUTHENTIK_JWKS_URI = 'https://auth.yjimmy.dev/application/o/job-tracker/jwks/'
    process.env.AUTHENTIK_AUDIENCE = 'legacy-audience'
    for (const [k, v] of Object.entries(GENERIC_ENV)) process.env[k] = v

    const config = getOAuthConfig()

    expect(config.issuer).toBe(GENERIC_ENV.OIDC_ISSUER)
    expect(config.jwksUri).toBe(GENERIC_ENV.OIDC_JWKS_URI)
    expect(config.audiences).toContain(GENERIC_ENV.OIDC_AUDIENCE)
    expect(config.audiences).not.toContain('legacy-audience')
  })

  it('defaults to RS256 but honors a custom OIDC_JWT_ALGORITHMS list', () => {
    expect(getOAuthConfig().algorithms).toEqual(['RS256'])

    process.env.OIDC_JWT_ALGORITHMS = 'ES256, PS256'
    expect(getOAuthConfig().algorithms).toEqual(['ES256', 'PS256'])
  })

  it('rejects unsupported/unsafe algorithms and falls back to the RS256 default', () => {
    // `none` and symmetric HS* must never be honored via the operator-supplied list.
    process.env.OIDC_JWT_ALGORITHMS = 'none, HS256'
    expect(getOAuthConfig().algorithms).toEqual(['RS256'])

    // Valid entries survive; unsupported ones are dropped from a mixed list.
    process.env.OIDC_JWT_ALGORITHMS = 'ES256, HS512, EdDSA'
    expect(getOAuthConfig().algorithms).toEqual(['ES256', 'EdDSA'])
  })

  it('verifies a bearer token against a generic provider using the configured algorithms', async () => {
    for (const [k, v] of Object.entries(GENERIC_ENV)) process.env[k] = v
    process.env.OIDC_JWT_ALGORITHMS = 'ES256'
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { iss: GENERIC_ENV.OIDC_ISSUER, sub: 'user-1', aud: GENERIC_ENV.OIDC_AUDIENCE },
      protectedHeader: { alg: 'ES256' },
      key: undefined,
    } as never)

    const req = new NextRequest('http://localhost/api/test', {
      headers: { authorization: 'Bearer generic-token' },
    })

    await expect(requireAuthentication(req)).resolves.toBe(true)
    expect(jwtVerify).toHaveBeenCalledWith(
      'generic-token',
      expect.anything(),
      expect.objectContaining({
        issuer: GENERIC_ENV.OIDC_ISSUER,
        algorithms: ['ES256'],
      }),
    )
  })

  it('accepts multiple trusted issuers configured via OIDC_TRUSTED_ISSUERS', () => {
    process.env.OIDC_TRUSTED_ISSUERS = [
      'https://id.acme.example/realms/scraper/',
      'https://id.acme.example/realms/extension/',
    ].join(' ')

    const config = getOAuthConfig()

    expect(config.providers).toEqual([
      {
        issuer: 'https://id.acme.example/realms/scraper/',
        jwksUri: 'https://id.acme.example/realms/scraper/jwks/',
      },
      {
        issuer: 'https://id.acme.example/realms/extension/',
        jwksUri: 'https://id.acme.example/realms/extension/jwks/',
      },
    ])
  })

  it('reads a custom forward-auth header via OIDC_FORWARD_AUTH_* config', async () => {
    for (const [k, v] of Object.entries(GENERIC_ENV)) process.env[k] = v
    process.env.OIDC_FORWARD_AUTH_ENABLED = 'true'
    process.env.OIDC_FORWARD_AUTH_HEADER = 'X-Proxy-JWT'

    const config = getOAuthConfig()
    expect(config.forwardAuthEnabled).toBe(true)
    expect(config.forwardAuthHeader).toBe('x-proxy-jwt')

    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { iss: GENERIC_ENV.OIDC_ISSUER, sub: 'user-1', aud: GENERIC_ENV.OIDC_AUDIENCE },
      protectedHeader: { alg: 'RS256' },
      key: undefined,
    } as never)

    const req = new NextRequest('http://localhost/api/test', {
      headers: { 'x-proxy-jwt': 'forwarded-token' },
    })

    await expect(requireAuthentication(req, { allowSameOrigin: true })).resolves.toBe(true)
  })

  it('resolves introspection credentials from OIDC_INTROSPECTION_* first', () => {
    process.env.OAUTH_CLIENT_ID = 'legacy-client'
    process.env.OAUTH_CLIENT_SECRET = 'legacy-secret'
    process.env.OIDC_INTROSPECTION_URI = 'https://id.acme.example/introspect'
    process.env.OIDC_INTROSPECTION_CLIENT_ID = 'introspection-client'
    process.env.OIDC_INTROSPECTION_CLIENT_SECRET = 'introspection-secret'

    const config = getOAuthConfig()

    expect(config.introspectionUri).toBe('https://id.acme.example/introspect')
    expect(config.introspectionClientId).toBe('introspection-client')
    expect(config.introspectionClientSecret).toBe('introspection-secret')
  })
})
