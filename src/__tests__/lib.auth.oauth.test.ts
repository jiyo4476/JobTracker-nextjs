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
import { requireApiKey, getOAuthConfig } from '@/lib/auth'

const OAUTH_ENV = {
  AUTHENTIK_BASE_URL: 'https://auth.example.com',
  AUTHENTIK_APP_SLUG: 'my-app',
  AUTHENTIK_ISSUER: 'https://auth.example.com/application/o/my-app/',
  AUTHENTIK_AUDIENCE: 'my-app-audience',
  AUTHENTIK_JWKS_URI: 'https://auth.example.com/application/o/my-app/jwks/',
}

describe('requireApiKey OAuth2/JWT verification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.API_KEY // force the OAuth2 path
    delete process.env.AUTHENTIK_REQUIRED_SCOPES
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
    await expect(requireApiKey(req)).resolves.toBe(true)
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
    await expect(requireApiKey(req)).resolves.toBe(true)
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
    await expect(requireApiKey(req)).resolves.toBe(false)
  })

  it('rejects a Bearer token when jwtVerify throws (invalid issuer/audience/signature)', async () => {
    vi.mocked(jwtVerify).mockRejectedValue(new Error('signature verification failed'))

    const req = new NextRequest('http://localhost/api/test', {
      headers: { authorization: 'Bearer invalid-token' },
    })
    await expect(requireApiKey(req)).resolves.toBe(false)
  })

  it('getOAuthConfig derives issuer/audience/jwksUri from AUTHENTIK_* env vars', () => {
    const config = getOAuthConfig()
    expect(config.issuer).toBe(OAUTH_ENV.AUTHENTIK_ISSUER)
    expect(config.audience).toBe(OAUTH_ENV.AUTHENTIK_AUDIENCE)
    expect(config.jwksUri).toBe(OAUTH_ENV.AUTHENTIK_JWKS_URI)
  })
})
