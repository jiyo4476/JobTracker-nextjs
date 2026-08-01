import { describe, it, expect } from 'vitest'
import { httpUrlSchema, isoDateSchema } from '@/lib/validators'

describe('httpUrlSchema', () => {
  it('accepts http and https URLs', () => {
    expect(httpUrlSchema.safeParse('http://example.com').success).toBe(true)
    expect(httpUrlSchema.safeParse('https://example.com/path?q=1').success).toBe(true)
  })

  it('rejects non-http(s) schemes and malformed URLs', () => {
    expect(httpUrlSchema.safeParse('javascript:alert(1)').success).toBe(false)
    expect(httpUrlSchema.safeParse('data:text/html,x').success).toBe(false)
    expect(httpUrlSchema.safeParse('ftp://example.com').success).toBe(false)
    expect(httpUrlSchema.safeParse('not-a-url').success).toBe(false)
  })

  it('rejects URLs longer than 2000 chars', () => {
    const longUrl = `https://example.com/${'a'.repeat(2100)}`
    expect(httpUrlSchema.safeParse(longUrl).success).toBe(false)
  })
})

describe('isoDateSchema', () => {
  it('accepts a well-formed calendar date', () => {
    expect(isoDateSchema.safeParse('2026-07-08').success).toBe(true)
    expect(isoDateSchema.safeParse('2024-02-29').success).toBe(true) // leap year
  })

  it('rejects malformed date strings', () => {
    expect(isoDateSchema.safeParse('07/08/2026').success).toBe(false)
    expect(isoDateSchema.safeParse('2026-7-8').success).toBe(false)
    expect(isoDateSchema.safeParse('3 days ago').success).toBe(false)
    expect(isoDateSchema.safeParse('').success).toBe(false)
  })

  it('rejects impossible calendar dates the bare regex would accept', () => {
    expect(isoDateSchema.safeParse('2024-99-99').success).toBe(false)
    expect(isoDateSchema.safeParse('2026-02-30').success).toBe(false)
    expect(isoDateSchema.safeParse('2026-13-01').success).toBe(false)
    expect(isoDateSchema.safeParse('2025-02-29').success).toBe(false) // not a leap year
  })
})
