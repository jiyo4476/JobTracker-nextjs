import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('jose', () => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => vi.fn()),
}))

import { jwtVerify } from 'jose'
import {
  AuthenticationError,
  authenticateRequest,
  requireAuthentication,
  requireServicePrincipal,
  requireUser,
} from '@/lib/auth'

const ISSUER = 'https://auth.example.com/application/o/job-tracker/'

describe('verified application principal context', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.AUTHENTIK_ISSUER = ISSUER
    process.env.AUTHENTIK_AUDIENCE = 'job-tracker'
    process.env.AUTHENTIK_JWKS_URI = `${ISSUER}jwks/`
    delete process.env.AUTHENTIK_SERVICE_PRINCIPALS
    delete process.env.AUTHENTIK_SERVICE_ISSUERS
    delete process.env.AUTH_DEV_ALLOW_SAME_ORIGIN
    delete process.env.AUTH_DEV_ISSUER
    delete process.env.AUTH_DEV_SUBJECT
    delete process.env.AUTH_DEV_ADMIN
    delete process.env.OIDC_ADMIN_GROUPS
    delete process.env.OIDC_ADMIN_SCOPES
    delete process.env.AUTHENTIK_ADMIN_GROUPS
    delete process.env.AUTHENTIK_ADMIN_SCOPES
  })

  afterEach(() => {
    delete process.env.AUTHENTIK_SERVICE_PRINCIPALS
    delete process.env.AUTHENTIK_SERVICE_ISSUERS
    delete process.env.AUTH_DEV_ALLOW_SAME_ORIGIN
    delete process.env.AUTH_DEV_ISSUER
    delete process.env.AUTH_DEV_SUBJECT
    delete process.env.AUTH_DEV_ADMIN
    delete process.env.OIDC_ADMIN_GROUPS
    delete process.env.OIDC_ADMIN_SCOPES
    delete process.env.AUTHENTIK_ADMIN_GROUPS
    delete process.env.AUTHENTIK_ADMIN_SCOPES
    vi.restoreAllMocks()
  })

  it('derives a stable human identity from verified issuer and subject only', async () => {
    vi.mocked(jwtVerify)
      .mockResolvedValueOnce({
        payload: { iss: ISSUER, sub: 'authentik-user-1', email: 'old@example.com' },
        protectedHeader: { alg: 'RS256' },
      } as never)
      .mockResolvedValueOnce({
        payload: { iss: ISSUER, sub: 'authentik-user-1', email: 'new@example.com' },
        protectedHeader: { alg: 'RS256' },
      } as never)

    const first = await requireUser(bearerRequest('first-token'))
    const second = await requireUser(bearerRequest('second-token'))

    expect(first.identityKey).toBe(second.identityKey)
    expect(first).toMatchObject({ kind: 'user', issuer: ISSUER, subject: 'authentik-user-1' })
    expect(first).not.toHaveProperty('email')
  })

  it('rejects a verified token without a stable subject', async () => {
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { iss: ISSUER },
      protectedHeader: { alg: 'RS256' },
    } as never)

    await expect(authenticateRequest(bearerRequest('subjectless-token'))).resolves.toBeNull()
  })

  it('recognizes only an explicitly allow-listed service principal and capability', async () => {
    process.env.AUTHENTIK_SERVICE_PRINCIPALS = JSON.stringify([{
      issuer: ISSUER,
      subject: 'scraper-client',
      capabilities: ['jobs:ingest', 'admin:anything'],
    }])
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { iss: ISSUER, sub: 'scraper-client', scope: 'jobs.write' },
      protectedHeader: { alg: 'RS256' },
    } as never)

    await expect(requireServicePrincipal(bearerRequest('service-token'), 'jobs:ingest'))
      .resolves.toMatchObject({
        kind: 'service',
        subject: 'scraper-client',
        capabilities: ['jobs:ingest'],
      })
  })

  it('does not let an allow-listed service principal use the human helper', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    process.env.AUTHENTIK_SERVICE_PRINCIPALS = JSON.stringify([{
      issuer: ISSUER,
      subject: 'scraper-client',
      capabilities: ['jobs:ingest'],
    }])
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { iss: ISSUER, sub: 'scraper-client' },
      protectedHeader: { alg: 'RS256' },
    } as never)

    await expect(requireUser(bearerRequest('service-token'))).rejects.toMatchObject({
      code: 'wrong_principal',
    } satisfies Partial<AuthenticationError>)
    const rejection = warn.mock.calls
      .map(([entry]) => JSON.parse(String(entry)) as Record<string, unknown>)
      .find(entry => entry.msg === 'authentication rejected')
    expect(rejection).toMatchObject({
      code: 'wrong_principal',
      issuer: ISSUER,
      subject: 'scraper-client',
      principalKind: 'service',
    })
    expect(rejection).not.toHaveProperty('token')
  })

  it('warns safely and grants no capability when service-principal JSON is malformed', async () => {
    const malformed = 'sensitive-deployment-value{'
    process.env.AUTHENTIK_SERVICE_PRINCIPALS = malformed
    process.env.AUTHENTIK_SERVICE_ISSUERS = ISSUER
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { iss: ISSUER, sub: 'scraper-client' },
      protectedHeader: { alg: 'RS256' },
    } as never)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const principal = await authenticateRequest(bearerRequest('service-token'))

    expect(principal).toMatchObject({ kind: 'service', capabilities: [] })
    const configWarning = warn.mock.calls
      .map(([entry]) => String(entry))
      .find(entry => entry.includes('auth_service_principal_config_invalid'))
    expect(configWarning).toBeDefined()
    expect(JSON.parse(configWarning!)).toMatchObject({
      msg: 'invalid Authentik service-principal configuration',
      code: 'auth_service_principal_config_invalid',
      variable: 'AUTHENTIK_SERVICE_PRINCIPALS',
      reason: 'invalid_json',
    })
    expect(configWarning).not.toContain(malformed)
  })

  it('restricts service tokens to the ingestion route contract', async () => {
    process.env.AUTHENTIK_SERVICE_PRINCIPALS = JSON.stringify([{
      issuer: ISSUER,
      subject: 'scraper-client',
      capabilities: ['jobs:ingest'],
    }])
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { iss: ISSUER, sub: 'scraper-client' },
      protectedHeader: { alg: 'RS256' },
    } as never)

    await expect(requireAuthentication(bearerRequest('service-token'))).resolves.toBe(false)
    await expect(requireAuthentication(bearerRequest('service-token'), {
      allowSameOrigin: false,
      principal: 'ingestion',
    })).resolves.toBe(true)
  })

  it('rejects spoofed same-origin and identity headers unless explicit dev mode is configured', async () => {
    const request = new NextRequest('http://localhost/api/test', {
      headers: {
        host: 'localhost',
        origin: 'http://localhost',
        'x-authentik-uid': 'spoofed-user',
      },
    })

    await expect(authenticateRequest(request)).resolves.toBeNull()
  })

  it('allows an explicit non-production development identity without trusting caller identity headers', async () => {
    process.env.AUTH_DEV_ALLOW_SAME_ORIGIN = 'true'
    process.env.AUTH_DEV_ISSUER = 'http://local-development'
    process.env.AUTH_DEV_SUBJECT = 'developer'
    const request = new NextRequest('http://localhost/api/test', {
      headers: { host: 'localhost', origin: 'http://localhost', 'x-authentik-uid': 'spoofed' },
    })

    await expect(requireUser(request)).resolves.toMatchObject({
      method: 'development',
      subject: 'developer',
    })
  })

  it('uses a safe request correlation ID and never places a token on the principal', async () => {
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { iss: ISSUER, sub: 'user-1' },
      protectedHeader: { alg: 'RS256' },
    } as never)
    const request = new NextRequest('http://localhost/api/test', {
      headers: { authorization: 'Bearer secret-token', 'x-request-id': 'request-123' },
    })

    const principal = await requireUser(request)
    expect(principal.correlationId).toBe('request-123')
    expect(principal).not.toHaveProperty('token')
  })
})

function bearerRequest(token: string): NextRequest {
  return new NextRequest('http://localhost/api/test', {
    headers: { authorization: `Bearer ${token}` },
  })
}

describe('catalog-admin claim derivation (API-013 slice 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.AUTHENTIK_ISSUER = ISSUER
    process.env.AUTHENTIK_AUDIENCE = 'job-tracker'
    process.env.AUTHENTIK_JWKS_URI = `${ISSUER}jwks/`
    delete process.env.OIDC_ADMIN_GROUPS
    delete process.env.OIDC_ADMIN_SCOPES
  })
  afterEach(() => {
    delete process.env.OIDC_ADMIN_GROUPS
    delete process.env.OIDC_ADMIN_SCOPES
    vi.restoreAllMocks()
  })

  function mockToken(payload: Record<string, unknown>) {
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { iss: ISSUER, sub: 'user-1', ...payload },
      protectedHeader: { alg: 'RS256' },
    } as never)
  }

  it('fails closed: no admin group/scope configured means no user is admin', async () => {
    mockToken({ groups: ['catalog-admins'], scope: 'openid catalog:admin' })
    const principal = await requireUser(bearerRequest('t'))
    expect(principal.kind).toBe('user')
    if (principal.kind === 'user') expect(principal.isAdmin).toBe(false)
  })

  it('grants admin from a verified group claim matching OIDC_ADMIN_GROUPS', async () => {
    process.env.OIDC_ADMIN_GROUPS = 'catalog-admins'
    mockToken({ groups: ['staff', 'catalog-admins'] })
    const principal = await requireUser(bearerRequest('t'))
    if (principal.kind === 'user') expect(principal.isAdmin).toBe(true)
    else throw new Error('expected user principal')
  })

  it('grants admin from a verified scope claim matching OIDC_ADMIN_SCOPES', async () => {
    process.env.OIDC_ADMIN_SCOPES = 'catalog:admin'
    mockToken({ scope: 'openid profile catalog:admin' })
    const principal = await requireUser(bearerRequest('t'))
    if (principal.kind === 'user') expect(principal.isAdmin).toBe(true)
    else throw new Error('expected user principal')
  })

  it('denies admin when the verified groups/scopes do not include the configured admin claim', async () => {
    process.env.OIDC_ADMIN_GROUPS = 'catalog-admins'
    process.env.OIDC_ADMIN_SCOPES = 'catalog:admin'
    mockToken({ groups: ['staff'], scope: 'openid profile' })
    const principal = await requireUser(bearerRequest('t'))
    if (principal.kind === 'user') expect(principal.isAdmin).toBe(false)
    else throw new Error('expected user principal')
  })

  it('ignores a malformed (non-array) groups claim without granting admin', async () => {
    process.env.OIDC_ADMIN_GROUPS = 'catalog-admins'
    mockToken({ groups: 'catalog-admins' })
    const principal = await requireUser(bearerRequest('t'))
    if (principal.kind === 'user') expect(principal.isAdmin).toBe(false)
    else throw new Error('expected user principal')
  })
})
