import { describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { requireApiKey } from '@/lib/auth'

describe('requireApiKey', () => {
  beforeEach(() => {
    process.env.API_KEY = 'test-key'
  })

  it('returns true for legacy API_KEY fallback Bearer token', async () => {
    const req = new NextRequest('http://localhost/api/test', {
      headers: { authorization: 'Bearer test-key' },
    })
    await expect(requireApiKey(req)).resolves.toBe(true)
  })

  it('returns false for wrong token', async () => {
    const req = new NextRequest('http://localhost/api/test', {
      headers: { authorization: 'Bearer wrong-key' },
    })
    await expect(requireApiKey(req)).resolves.toBe(false)
  })

  it('returns false for malformed header (no Bearer prefix)', async () => {
    const req = new NextRequest('http://localhost/api/test', {
      headers: { authorization: 'test-key' },
    })
    await expect(requireApiKey(req)).resolves.toBe(false)
  })

  // A request with no auth header AND no Origin/Referer is never trusted — that's
  // trivial for a non-browser client (curl, a script) to produce, so treating it as
  // same-origin would bypass auth entirely.
  it('returns false for a request with no auth header and no origin/referer', async () => {
    const req = new NextRequest('http://localhost/api/test')
    await expect(requireApiKey(req)).resolves.toBe(false)
  })

  it('returns true for same-origin request with no auth header and a matching origin', async () => {
    const req = new NextRequest('http://localhost/api/test', {
      headers: { origin: 'http://localhost', host: 'localhost' },
    })
    await expect(requireApiKey(req)).resolves.toBe(true)
  })

  it('returns false for external request with no auth header but a non-matching origin', async () => {
    const req = new NextRequest('http://localhost/api/test', {
      headers: { origin: 'https://external-site.com' },
    })
    await expect(requireApiKey(req)).resolves.toBe(false)
  })

  it('returns false for opaque bearer tokens when API_KEY env var is not set', async () => {
    delete process.env.API_KEY
    const req = new NextRequest('http://localhost/api/test', {
      headers: { authorization: 'Bearer anything' },
    })
    await expect(requireApiKey(req)).resolves.toBe(false)
  })

  it('returns false when API_KEY is unset and no auth header or origin is provided', async () => {
    delete process.env.API_KEY
    const req = new NextRequest('http://localhost/api/test')
    await expect(requireApiKey(req)).resolves.toBe(false)
  })

  it('returns false for "Bearer undefined" when API_KEY is set', async () => {
    // API_KEY is 'test-key' (set in beforeEach); 'Bearer undefined' is not a valid token
    const req = new NextRequest('http://localhost/api/test', {
      headers: { authorization: 'Bearer undefined' },
    })
    await expect(requireApiKey(req)).resolves.toBe(false)
  })
})
