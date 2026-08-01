import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { requireAuthentication } from '@/lib/auth'

describe('requireAuthentication', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv, API_KEY: 'test-key' }
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('AUTHENTIK_') || key.startsWith('OAUTH_')) {
        delete process.env[key]
      }
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401 })),
    )
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('rejects a legacy API key even when a stale API_KEY environment variable exists', async () => {
    const req = new NextRequest('http://localhost/api/test', {
      headers: { authorization: 'Bearer test-key' },
    })
    await expect(requireAuthentication(req)).resolves.toBe(false)
  })

  it('returns false for wrong token', async () => {
    const req = new NextRequest('http://localhost/api/test', {
      headers: { authorization: 'Bearer wrong-key' },
    })
    await expect(requireAuthentication(req)).resolves.toBe(false)
  })

  it('returns false for malformed header (no Bearer prefix)', async () => {
    const req = new NextRequest('http://localhost/api/test', {
      headers: { authorization: 'test-key' },
    })
    await expect(requireAuthentication(req)).resolves.toBe(false)
  })

  // A request with no auth header AND no Origin/Referer is never trusted — that's
  // trivial for a non-browser client (curl, a script) to produce, so treating it as
  // same-origin would bypass auth entirely.
  it('returns false for a request with no auth header and no origin/referer', async () => {
    const req = new NextRequest('http://localhost/api/test')
    await expect(requireAuthentication(req)).resolves.toBe(false)
  })

  it('returns true for same-origin request with no auth header and a matching origin', async () => {
    const req = new NextRequest('http://localhost/api/test', {
      headers: { origin: 'http://localhost', host: 'localhost' },
    })
    await expect(requireAuthentication(req)).resolves.toBe(true)
  })

  it('returns false for external request with no auth header but a non-matching origin', async () => {
    const req = new NextRequest('http://localhost/api/test', {
      headers: { origin: 'https://external-site.com' },
    })
    await expect(requireAuthentication(req)).resolves.toBe(false)
  })

  it('returns false for opaque bearer tokens', async () => {
    const req = new NextRequest('http://localhost/api/test', {
      headers: { authorization: 'Bearer anything' },
    })
    await expect(requireAuthentication(req)).resolves.toBe(false)
  })

  it('returns false when no auth header or origin is provided', async () => {
    const req = new NextRequest('http://localhost/api/test')
    await expect(requireAuthentication(req)).resolves.toBe(false)
  })

  it('returns false for "Bearer undefined"', async () => {
    const req = new NextRequest('http://localhost/api/test', {
      headers: { authorization: 'Bearer undefined' },
    })
    await expect(requireAuthentication(req)).resolves.toBe(false)
  })
})
