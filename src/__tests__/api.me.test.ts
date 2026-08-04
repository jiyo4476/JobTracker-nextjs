import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/resolved-user', () => ({
  resolveRequestUser: vi.fn(),
}))

import { resolveRequestUser } from '@/lib/resolved-user'

function makeReq() {
  return new NextRequest('http://localhost/api/me', {
    method: 'GET',
    headers: { authorization: 'Bearer test-key' },
  })
}

function resolveAs(user: {
  id: number
  email?: string | null
  displayName?: string | null
}) {
  vi.mocked(resolveRequestUser).mockResolvedValue({
    ok: true,
    user: {
      id: user.id,
      issuer: 'https://issuer.example/',
      subject: `sub-${user.id}`,
      email: user.email ?? null,
      displayName: user.displayName ?? null,
      principal: {} as never,
    },
  })
}

// A denied resolution — the shape requireResolvedUser produces for an
// unauthenticated caller OR a service (scraper/ingestion) principal.
function resolveUnauthorized() {
  vi.mocked(resolveRequestUser).mockResolvedValue({
    ok: false,
    response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  })
}

function resolveForbidden() {
  vi.mocked(resolveRequestUser).mockResolvedValue({
    ok: false,
    response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/me', () => {
  it('returns the server-resolved internal user id plus safe metadata (private, no-store)', async () => {
    resolveAs({ id: 42, email: 'jane@example.com', displayName: 'Jane' })
    const { GET } = await import('@/app/api/me/route')
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(await res.json()).toEqual({
      user_id: 42,
      email: 'jane@example.com',
      display_name: 'Jane',
    })
  })

  it('nulls optional metadata when the resolved row has none', async () => {
    resolveAs({ id: 7, email: null, displayName: null })
    const { GET } = await import('@/app/api/me/route')
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ user_id: 7, email: null, display_name: null })
  })

  it('never leaks the OAuth identity keys, principal, or token', async () => {
    resolveAs({ id: 99, email: 'x@y.z', displayName: 'X' })
    const { GET } = await import('@/app/api/me/route')
    const res = await GET(makeReq())
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(['display_name', 'email', 'user_id'])
    // The verified (issuer, subject) identity keys and principal are server-only.
    expect(body).not.toHaveProperty('issuer')
    expect(body).not.toHaveProperty('subject')
    expect(body).not.toHaveProperty('principal')
    expect(JSON.stringify(body)).not.toContain('test-key')
  })

  it('returns 401 for an unauthenticated caller', async () => {
    resolveUnauthorized()
    const { GET } = await import('@/app/api/me/route')
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('rejects a service principal (interactive-only) with 401 and no identity body', async () => {
    // requireResolvedUser → requireUser rejects a non-"user" principal as
    // wrong_principal, which resolveRequestUser maps to 401. The route must surface
    // that response and never disclose a user_id for a machine token.
    resolveUnauthorized()
    const { GET } = await import('@/app/api/me/route')
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
    expect(await res.json()).not.toHaveProperty('user_id')
  })

  it('returns 403 for a resolved but deactivated account', async () => {
    resolveForbidden()
    const { GET } = await import('@/app/api/me/route')
    const res = await GET(makeReq())
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Forbidden' })
  })
})
