import { describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { requireApiKey } from '@/lib/auth'

describe('requireApiKey', () => {
  beforeEach(() => {
    process.env.API_KEY = 'test-key'
  })

  it('returns true for valid Bearer token', () => {
    const req = new NextRequest('http://localhost/api/test', {
      headers: { authorization: 'Bearer test-key' },
    })
    expect(requireApiKey(req)).toBe(true)
  })

  it('returns false for wrong token', () => {
    const req = new NextRequest('http://localhost/api/test', {
      headers: { authorization: 'Bearer wrong-key' },
    })
    expect(requireApiKey(req)).toBe(false)
  })

  it('returns false for malformed header (no Bearer prefix)', () => {
    const req = new NextRequest('http://localhost/api/test', {
      headers: { authorization: 'test-key' },
    })
    expect(requireApiKey(req)).toBe(false)
  })

  // Same-origin browser requests (no auth header, no external origin) are allowed
  it('returns true for same-origin request with no auth header and no origin', () => {
    const req = new NextRequest('http://localhost/api/test')
    expect(requireApiKey(req)).toBe(true)
  })

  it('returns false for external request with no auth header but a non-matching origin', () => {
    const req = new NextRequest('http://localhost/api/test', {
      headers: { origin: 'https://external-site.com' },
    })
    expect(requireApiKey(req)).toBe(false)
  })

  // When API_KEY is not configured, the server is in open-access mode
  it('returns true when API_KEY env var is not set (open-access mode)', () => {
    delete process.env.API_KEY
    const req = new NextRequest('http://localhost/api/test', {
      headers: { authorization: 'Bearer anything' },
    })
    expect(requireApiKey(req)).toBe(true)
  })

  it('returns true when API_KEY is unset and no auth header is provided (fully unauthenticated open access)', () => {
    delete process.env.API_KEY
    const req = new NextRequest('http://localhost/api/test')
    expect(requireApiKey(req)).toBe(true)
  })

  it('returns false for "Bearer undefined" when API_KEY is set', () => {
    // API_KEY is 'test-key' (set in beforeEach); 'Bearer undefined' is not a valid token
    const req = new NextRequest('http://localhost/api/test', {
      headers: { authorization: 'Bearer undefined' },
    })
    expect(requireApiKey(req)).toBe(false)
  })
})
