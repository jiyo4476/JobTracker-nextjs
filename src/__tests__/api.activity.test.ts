import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

vi.mock('@/lib/resolved-user', () => ({
  resolveRequestUser: vi.fn(),
}))

vi.mock('@/db/session', () => ({
  withUser: vi.fn(),
}))

import { resolveRequestUser } from '@/lib/resolved-user'
import { withUser } from '@/db/session'

function renderParams(query: unknown): unknown[] {
  return new PgDialect().sqlToQuery(query as SQL).params
}

function makeReq() {
  return new NextRequest('http://localhost/api/activity', {
    headers: { authorization: 'Bearer test-key' },
  })
}

function resolveAs(userId: number) {
  vi.mocked(resolveRequestUser).mockResolvedValue({
    ok: true,
    user: { id: userId, issuer: 'https://issuer/', subject: `sub-${userId}`, email: null, displayName: null, principal: {} as never },
  })
}
function resolveDenied() {
  vi.mocked(resolveRequestUser).mockResolvedValue({
    ok: false,
    response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  })
}

const mockRows = [
  {
    id: 1, jobId: 10, jobTitle: 'Software Engineer', companyName: 'Acme Corp',
    fromStage: 'applied', toStage: 'phone_screen', changedAt: new Date('2024-03-01T12:00:00Z'),
  },
  {
    id: 2, jobId: 11, jobTitle: 'Backend Developer', companyName: null,
    fromStage: null, toStage: 'applied', changedAt: new Date('2024-03-02T08:30:00Z'),
  },
]

function setupTx(rows: unknown[] = mockRows, whereCapture?: unknown[]) {
  vi.mocked(withUser).mockImplementation(async (_id, fn) => {
    const tx = {
      select: vi.fn(() => {
        const chain: Record<string, unknown> = {}
        const terminal = Promise.resolve(rows)
        for (const m of ['from', 'innerJoin', 'leftJoin', 'orderBy', 'limit']) {
          chain[m] = vi.fn(() => chain)
        }
        chain.where = vi.fn((arg: unknown) => { whereCapture?.push(arg); return chain })
        chain.then = terminal.then.bind(terminal)
        chain.catch = terminal.catch.bind(terminal)
        chain.finally = terminal.finally.bind(terminal)
        return chain
      }),
    }
    return fn(tx as never)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  resolveAs(1)
  setupTx()
})

describe('GET /api/activity', () => {
  it('returns 401 when the user cannot be resolved', async () => {
    resolveDenied()
    const { GET } = await import('@/app/api/activity/route')
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
  })

  it('returns 200 with activity rows', async () => {
    const { GET } = await import('@/app/api/activity/route')
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json)).toBe(true)
    expect(json).toHaveLength(2)
  })

  it('maps row fields correctly', async () => {
    const { GET } = await import('@/app/api/activity/route')
    const res = await GET(makeReq())
    const json = await res.json()
    expect(json[0]).toMatchObject({
      id: 1, jobId: 10, jobTitle: 'Software Engineer', companyName: 'Acme Corp',
      fromStage: 'applied', toStage: 'phone_screen', changedAt: '2024-03-01T12:00:00.000Z',
    })
  })

  it('handles null companyName and fromStage', async () => {
    const { GET } = await import('@/app/api/activity/route')
    const res = await GET(makeReq())
    const json = await res.json()
    expect(json[1].companyName).toBeNull()
    expect(json[1].fromStage).toBeNull()
  })

  it('is private/no-store (dropped shared s-maxage caching)', async () => {
    const { GET } = await import('@/app/api/activity/route')
    const res = await GET(makeReq())
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })

  it('returns empty array when no rows', async () => {
    setupTx([])
    const { GET } = await import('@/app/api/activity/route')
    const res = await GET(makeReq())
    const json = await res.json()
    expect(json).toEqual([])
  })

  it('scopes the history read to the caller user_id (two-user isolation)', async () => {
    const whereCapture: unknown[] = []
    setupTx(mockRows, whereCapture)
    resolveAs(2)
    const { GET } = await import('@/app/api/activity/route')
    await GET(makeReq())
    expect(whereCapture).toHaveLength(1)
    const params = renderParams(whereCapture[0])
    expect(params).toContain(2)
    expect(params).not.toContain(1)
  })
})
