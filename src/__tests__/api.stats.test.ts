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
  return new NextRequest('http://localhost/api/stats', {
    headers: { authorization: 'Bearer test-key' },
  })
}

function resolveAs(userId: number) {
  vi.mocked(resolveRequestUser).mockResolvedValue({
    ok: true,
    user: { id: userId, issuer: 'https://issuer/', subject: `sub-${userId}`, principal: {} as never },
  })
}
function resolveDenied() {
  vi.mocked(resolveRequestUser).mockResolvedValue({
    ok: false,
    response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  })
}

// Ordered results for the 10 Promise.all queries in getStats.
const DEFAULT_QUEUE = [
  [{ trackedJobs: 8 }],
  [{ applied: 5 }],
  [{ activeInterviews: 2 }],
  [{ staleListings: 3 }],
  [{ stage: 'applied', count: 5 }],
  [{ totalJobs: 42 }],
  [{ name: 'TypeScript', jobCount: 20 }],
  [{ week: '2024-01-01', jobCount: 7 }],
  [{ remoteCount: 30 }],
  [{ onsiteCount: 12 }],
]

// Build a tx whose .select() pops the next queued result. `whereCapture` records
// every rendered .where() condition so owner predicates can be asserted.
function setupTx(queue: unknown[][] = DEFAULT_QUEUE, whereCapture?: unknown[]) {
  vi.mocked(withUser).mockImplementation(async (_id, fn) => {
    let i = 0
    const tx = {
      select: vi.fn(() => {
        const result = queue[i++] ?? []
        const chain: Record<string, unknown> = {}
        const terminal = Promise.resolve(result)
        for (const m of ['from', 'innerJoin', 'leftJoin', 'groupBy', 'orderBy', 'limit', 'offset']) {
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

describe('GET /api/stats', () => {
  it('returns 401 when the user cannot be resolved', async () => {
    resolveDenied()
    const { GET } = await import('@/app/api/stats/route')
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
  })

  it('returns personal KPIs and a separately-named catalog block', async () => {
    const { GET } = await import('@/app/api/stats/route')
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const json = await res.json()
    // Personal application KPIs live at the top level.
    expect(json).toMatchObject({
      scope: 'personal',
      trackedJobs: 8,
      applied: 5,
      activeInterviews: 2,
      staleListings: 3,
    })
    expect(Array.isArray(json.stageCounts)).toBe(true)
    // Catalog supply metrics are quarantined under `catalog`, never mixed with the
    // personal numerators above.
    expect(json.catalog).toMatchObject({ totalJobs: 42, remoteCount: 30, onsiteCount: 12 })
    expect(Array.isArray(json.catalog.topSkills)).toBe(true)
    expect(Array.isArray(json.catalog.weeklyJobCounts)).toBe(true)
    // Personal numerators must NOT leak to the top level as if global.
    expect(json).not.toHaveProperty('totalJobs')
  })

  it('is private/no-store (never shared-cached)', async () => {
    const { GET } = await import('@/app/api/stats/route')
    const res = await GET(makeReq())
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })

  it('scopes every personal KPI query to the caller user_id', async () => {
    const whereCapture: unknown[] = []
    setupTx(DEFAULT_QUEUE, whereCapture)
    resolveAs(7)
    const { GET } = await import('@/app/api/stats/route')
    await GET(makeReq())
    // The first five queries (trackedJobs, applied, activeInterviews, staleListings,
    // stageCounts) are the personal aggregates — each must bind user_id = 7.
    for (const cond of whereCapture.slice(0, 5)) {
      expect(renderParams(cond)).toContain(7)
    }
  })

  it('two-user isolation: user B stats never bind user A id', async () => {
    const whereCapture: unknown[] = []
    setupTx(DEFAULT_QUEUE, whereCapture)
    resolveAs(2)
    const { GET } = await import('@/app/api/stats/route')
    await GET(makeReq())
    const personalConds = whereCapture.slice(0, 5)
    for (const cond of personalConds) {
      const params = renderParams(cond)
      expect(params).toContain(2)
      expect(params).not.toContain(1)
    }
  })
})
