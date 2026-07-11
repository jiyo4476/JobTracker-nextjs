import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Isolated in its own file for the same reason as lib.auth.oauth.test.ts: mocking
// 'jose' here is hoisted file-wide and would break lib.auth.test.ts's legacy-path
// tests that rely on the real jwtVerify throwing for garbage/opaque tokens.
vi.mock('jose', () => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => vi.fn()),
}))

import { jwtVerify } from 'jose'
import { requireApiKey } from '@/lib/auth'

const OAUTH_ENV = {
  AUTHENTIK_BASE_URL: 'https://auth.example.com',
  AUTHENTIK_APP_SLUG: 'job-tracker',
  AUTHENTIK_ISSUER: 'https://auth.example.com/application/o/job-tracker/',
  AUTHENTIK_JWKS_URI: 'https://auth.example.com/application/o/job-tracker/jwks/',
}

describe('requireApiKey forward-auth JWT path (AUTHENTIK_FORWARD_AUTH_ENABLED)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.API_KEY
    process.env.AUTHENTIK_FORWARD_AUTH_ENABLED = 'true'
    for (const [k, v] of Object.entries(OAUTH_ENV)) process.env[k] = v
  })

  afterEach(() => {
    delete process.env.AUTHENTIK_FORWARD_AUTH_ENABLED
  })

  it('accepts a request with a valid X-authentik-jwt header', async () => {
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { iss: OAUTH_ENV.AUTHENTIK_ISSUER },
      protectedHeader: { alg: 'RS256' },
      key: undefined,
    } as never)

    const req = new NextRequest('http://localhost/api/test', {
      headers: { 'x-authentik-jwt': 'valid-forward-auth-jwt' },
    })
    await expect(requireApiKey(req)).resolves.toBe(true)
  })

  // The forward-auth JWT is issued per-proxy-provider, so it must be checked against
  // config.audiences the same way verifyOAuthToken checks bearer tokens — otherwise a
  // JWT minted for a different application behind the same Authentik instance/JWKS
  // would also verify here if this backend were ever reached by a path that skips the
  // Traefik ForwardAuth hop.
  it('verifies the JWT audience against config.audiences, not just issuer/signature', async () => {
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { iss: OAUTH_ENV.AUTHENTIK_ISSUER },
      protectedHeader: { alg: 'RS256' },
      key: undefined,
    } as never)

    const req = new NextRequest('http://localhost/api/test', {
      headers: { 'x-authentik-jwt': 'valid-forward-auth-jwt' },
    })
    await requireApiKey(req)

    expect(jwtVerify).toHaveBeenCalledWith(
      'valid-forward-auth-jwt',
      expect.anything(),
      expect.objectContaining({ audience: expect.arrayContaining(['job-tracker']) }),
    )
  })

  it('rejects a request with an invalid/unverifiable X-authentik-jwt header', async () => {
    vi.mocked(jwtVerify).mockRejectedValue(new Error('signature verification failed'))

    const req = new NextRequest('http://localhost/api/test', {
      headers: { 'x-authentik-jwt': 'forged-jwt' },
    })
    await expect(requireApiKey(req)).resolves.toBe(false)
  })

  it('rejects a request when jwtVerify throws for a wrong-audience token', async () => {
    vi.mocked(jwtVerify).mockRejectedValue(new Error('unexpected "aud" claim value'))

    const req = new NextRequest('http://localhost/api/test', {
      headers: { 'x-authentik-jwt': 'wrong-audience-jwt' },
    })
    await expect(requireApiKey(req)).resolves.toBe(false)
  })

  it('rejects a request with no X-authentik-jwt header at all', async () => {
    const req = new NextRequest('http://localhost/api/test')
    await expect(requireApiKey(req)).resolves.toBe(false)
    expect(jwtVerify).not.toHaveBeenCalled()
  })

  it('does not fall back to Origin/Referer matching once forward-auth is enabled', async () => {
    const req = new NextRequest('http://localhost/api/test', {
      headers: { origin: 'http://localhost', host: 'localhost' },
    })
    await expect(requireApiKey(req)).resolves.toBe(false)
    expect(jwtVerify).not.toHaveBeenCalled()
  })

  it('ignores X-authentik-jwt when allowSameOrigin is false', async () => {
    const req = new NextRequest('http://localhost/api/test', {
      headers: { 'x-authentik-jwt': 'valid-forward-auth-jwt' },
    })
    await expect(requireApiKey(req, { allowSameOrigin: false })).resolves.toBe(false)
    expect(jwtVerify).not.toHaveBeenCalled()
  })
})
