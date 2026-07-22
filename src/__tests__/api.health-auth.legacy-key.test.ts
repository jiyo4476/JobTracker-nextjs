import { beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/health/auth/route'

describe('GET /api/health/auth legacy API key rejection', () => {
  beforeEach(() => {
    process.env.API_KEY = 'retired-shared-secret'
    delete process.env.AUTHENTIK_INTROSPECTION_CLIENT_ID
    delete process.env.AUTHENTIK_INTROSPECTION_CLIENT_SECRET
    delete process.env.OAUTH_CLIENT_ID
    delete process.env.OAUTH_CLIENT_SECRET
  })

  it('returns 401 for the retired bearer value even when stale configuration remains', async () => {
    const req = new NextRequest('http://localhost/api/health/auth', {
      headers: { authorization: 'Bearer retired-shared-secret' },
    })

    const res = await GET(req)

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })
})
