import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Isolated in its own file: mocking 'jose' here is hoisted file-wide, and
// would otherwise break lib.auth.test.ts's legacy-path tests that rely on
// the real jwtVerify throwing for garbage/opaque tokens.
vi.mock('jose', () => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => vi.fn()),
}))

import { jwtVerify } from 'jose'
import { requireAuthentication, getOAuthConfig } from '@/lib/auth'

const OAUTH_ENV = {
  AUTHENTIK_BASE_URL: 'https://auth.example.com',
  AUTHENTIK_APP_SLUG: 'my-app',
  AUTHENTIK_ISSUER: 'https://auth.example.com/application/o/my-app/',
  AUTHENTIK_AUDIENCE: 'my-app-audience',
  AUTHENTIK_JWKS_URI: 'https://auth.example.com/application/o/my-app/jwks/',
}

describe('requireAuthentication OAuth2/JWT verification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.AUTHENTIK_REQUIRED_SCOPES
    delete process.env.AUTHENTIK_TRUSTED_ISSUERS
    delete process.env.AUTHENTIK_AUDIENCES
    delete process.env.AUTHENTIK_INTROSPECTION_URI
    delete process.env.AUTHENTIK_INTROSPECTION_CLIENT_ID
    delete process.env.AUTHENTIK_INTROSPECTION_CLIENT_SECRET
    delete process.env.OAUTH_CLIENT_ID
    delete process.env.OAUTH_CLIENT_SECRET
    vi.unstubAllGlobals()
    for (const [k, v] of Object.entries(OAUTH_ENV)) process.env[k] = v
  })

  it('accepts a Bearer token that passes JWKS verification and has no required scopes', async () => {
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { iss: OAUTH_ENV.AUTHENTIK_ISSUER, aud: OAUTH_ENV.AUTHENTIK_AUDIENCE },
      protectedHeader: { alg: 'RS256' },
      key: undefined,
    } as never)

    const req = new NextRequest('http://localhost/api/test', {
      headers: { authorization: 'Bearer valid-token' },
    })
    await expect(requireAuthentication(req)).resolves.toBe(true)
  })

  it('accepts a Bearer token whose scope claim contains all required scopes', async () => {
    process.env.AUTHENTIK_REQUIRED_SCOPES = 'api.read api.write'
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { scope: 'api.read api.write openid' },
      protectedHeader: { alg: 'RS256' },
      key: undefined,
    } as never)

    const req = new NextRequest('http://localhost/api/test', {
      headers: { authorization: 'Bearer valid-token' },
    })
    await expect(requireAuthentication(req)).resolves.toBe(true)
  })

  it('rejects a Bearer token missing a required scope', async () => {
    process.env.AUTHENTIK_REQUIRED_SCOPES = 'api.read api.write'
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { scope: 'api.read' },
      protectedHeader: { alg: 'RS256' },
      key: undefined,
    } as never)

    const req = new NextRequest('http://localhost/api/test', {
      headers: { authorization: 'Bearer incomplete-scope-token' },
    })
    await expect(requireAuthentication(req)).resolves.toBe(false)
  })

  it('rejects a Bearer token when jwtVerify throws (invalid issuer/audience/signature)', async () => {
    vi.mocked(jwtVerify).mockRejectedValue(new Error('signature verification failed'))

    const req = new NextRequest('http://localhost/api/test', {
      headers: { authorization: 'Bearer invalid-token' },
    })
    await expect(requireAuthentication(req)).resolves.toBe(false)
  })

  it('accepts an active introspected token when JWKS verification is unavailable', async () => {
    process.env.OAUTH_CLIENT_ID = 'client-id'
    process.env.OAUTH_CLIENT_SECRET = 'client-secret'
    vi.mocked(jwtVerify).mockRejectedValue(new Error('jwks unavailable'))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        active: true,
        iss: OAUTH_ENV.AUTHENTIK_ISSUER,
        aud: 'client-id',
        client_id: 'client-id',
        scope: 'openid profile email',
      }),
    }))

    const req = new NextRequest('http://localhost/api/test', {
      headers: { authorization: 'Bearer introspected-token' },
    })

    await expect(requireAuthentication(req)).resolves.toBe(true)
  })

  it('rejects an active introspected token with the wrong audience', async () => {
    process.env.OAUTH_CLIENT_ID = 'client-id'
    process.env.OAUTH_CLIENT_SECRET = 'client-secret'
    vi.mocked(jwtVerify).mockRejectedValue(new Error('jwks unavailable'))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        active: true,
        iss: OAUTH_ENV.AUTHENTIK_ISSUER,
        aud: 'wrong-audience',
        client_id: 'client-id',
        scope: 'openid profile email',
      }),
    }))

    const req = new NextRequest('http://localhost/api/test', {
      headers: { authorization: 'Bearer wrong-audience-token' },
    })

    await expect(requireAuthentication(req)).resolves.toBe(false)
  })

  it('tries each trusted issuer until one verifies the bearer token', async () => {
    delete process.env.AUTHENTIK_ISSUER
    delete process.env.AUTHENTIK_JWKS_URI
    process.env.AUTHENTIK_TRUSTED_ISSUERS = [
      'https://auth.yjimmy.dev/application/o/job-tracker-scraper/',
      'https://auth.yjimmy.dev/application/o/job-tracker-extension/',
    ].join(' ')
    vi.mocked(jwtVerify)
      .mockRejectedValueOnce(new Error('wrong issuer'))
      .mockResolvedValueOnce({
        payload: { scope: 'openid profile email' },
        protectedHeader: { alg: 'RS256' },
        key: undefined,
      } as never)

    const req = new NextRequest('http://localhost/api/test', {
      headers: { authorization: 'Bearer extension-token' },
    })

    await expect(requireAuthentication(req)).resolves.toBe(true)
    expect(jwtVerify).toHaveBeenCalledTimes(2)
  })

  it('getOAuthConfig derives issuer/audience/jwksUri from AUTHENTIK_* env vars', () => {
    const config = getOAuthConfig()
    expect(config.issuer).toBe(OAUTH_ENV.AUTHENTIK_ISSUER)
    expect(config.audience).toBe(OAUTH_ENV.AUTHENTIK_AUDIENCE)
    expect(config.jwksUri).toBe(OAUTH_ENV.AUTHENTIK_JWKS_URI)
  })

  it('getOAuthConfig accepts and de-duplicates multiple trusted Authentik issuers', () => {
    delete process.env.AUTHENTIK_ISSUER
    delete process.env.AUTHENTIK_JWKS_URI
    process.env.AUTHENTIK_TRUSTED_ISSUERS = [
      'https://auth.yjimmy.dev/application/o/job-tracker-scraper/',
      'https://auth.yjimmy.dev/application/o/job-tracker-extension/',
      'https://auth.yjimmy.dev/application/o/job-tracker-scraper/',
    ].join(' ')
    process.env.AUTHENTIK_AUDIENCES = 'job-tracker-scraper,job-tracker-extension'

    const config = getOAuthConfig()

    expect(config.providers).toEqual([
      {
        issuer: 'https://auth.yjimmy.dev/application/o/job-tracker-scraper/',
        jwksUri: 'https://auth.yjimmy.dev/application/o/job-tracker-scraper/jwks/',
      },
      {
        issuer: 'https://auth.yjimmy.dev/application/o/job-tracker-extension/',
        jwksUri: 'https://auth.yjimmy.dev/application/o/job-tracker-extension/jwks/',
      },
    ])
    expect(config.audiences).toContain('job-tracker-scraper')
    expect(config.audiences).toContain('job-tracker-extension')
  })
})
