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

  it('returns false when authorization header is missing', () => {
    const req = new NextRequest('http://localhost/api/test')
    expect(requireApiKey(req)).toBe(false)
  })

  it('returns false for malformed header (no Bearer prefix)', () => {
    const req = new NextRequest('http://localhost/api/test', {
      headers: { authorization: 'test-key' },
    })
    expect(requireApiKey(req)).toBe(false)
  })

  it('returns false when API_KEY env var is not set', () => {
    delete process.env.API_KEY
    const req = new NextRequest('http://localhost/api/test', {
      headers: { authorization: 'Bearer test-key' },
    })
    expect(requireApiKey(req)).toBe(false)
  })

  it('returns false for "Bearer undefined" when API_KEY is not set', () => {
    delete process.env.API_KEY
    const req = new NextRequest('http://localhost/api/test', {
      headers: { authorization: 'Bearer undefined' },
    })
    expect(requireApiKey(req)).toBe(false)
  })
})
