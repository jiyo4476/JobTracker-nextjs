import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({
  requireApiKey: vi.fn(),
}))

import { requireApiKey } from '@/lib/auth'

describe('GET /api/health/auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns ok when the API key is valid', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const { GET } = await import('@/app/api/health/auth/route')
    const req = new NextRequest('http://localhost/api/health/auth', {
      headers: { authorization: 'Bearer test-key' },
    })

    const res = await GET(req)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
    expect(requireApiKey).toHaveBeenCalledWith(req, { allowSameOrigin: false })
  })

  it('returns 401 when the API key is invalid', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(false)
    const { GET } = await import('@/app/api/health/auth/route')
    const req = new NextRequest('http://localhost/api/health/auth', {
      headers: { authorization: 'Bearer wrong-key' },
    })

    const res = await GET(req)

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 401 when auth is missing and requireApiKey rejects it', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(false)
    const { GET } = await import('@/app/api/health/auth/route')
    const req = new NextRequest('http://localhost/api/health/auth')

    const res = await GET(req)

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })
})
