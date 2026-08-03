import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

// GET uses the resolveRequestUser + withUser owner-scoping composition. POST is now an
// admin-only catalog create (API-013 slice 1), gated by resolveAdminUser.
vi.mock('@/lib/resolved-user', () => ({
  resolveRequestUser: vi.fn(),
}))

vi.mock('@/lib/admin', () => ({
  resolveAdminUser: vi.fn(),
}))

vi.mock('@/db/session', () => ({
  withUser: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: {
    insert: vi.fn(),
  },
}))

import { resolveRequestUser } from '@/lib/resolved-user'
import { resolveAdminUser } from '@/lib/admin'
import { withUser } from '@/db/session'
import { db } from '@/db'

const adminOk = { ok: true as const, user: { id: 1, issuer: 'https://issuer/', subject: 'admin', principal: {} as never } }
function forbidden() { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

function sqlText(query: unknown): string {
  return new PgDialect().sqlToQuery(query as SQL).sql.replace(/\s+/g, ' ')
}

const mockJobRows = [
  { id: 1, jobTitle: 'Software Engineer', companyName: 'Acme', isRemote: true, interviewStage: 'not_applied', stateUserId: 1, isHidden: false },
  { id: 2, jobTitle: 'Product Manager', companyName: 'Beta Corp', isRemote: false, interviewStage: 'applied', stateUserId: 1, isHidden: false },
]

// A thenable drizzle-like chain: every builder method returns the chain; awaiting it
// yields `result`. `onWhere` captures the WHERE argument for SQL assertions.
function makeTxChain(result: unknown, onWhere?: (arg: unknown) => void, onOrderBy?: (values: unknown[]) => void) {
  const chain: Record<string, unknown> = {}
  const terminal = Promise.resolve(result)
  const passthrough = ['from', 'leftJoin', 'innerJoin', 'limit', 'offset', 'groupBy']
  passthrough.forEach((m) => { chain[m] = vi.fn(() => chain) })
  chain.where = vi.fn((arg: unknown) => { onWhere?.(arg); return chain })
  chain.orderBy = vi.fn((...values: unknown[]) => { onOrderBy?.(values); return chain })
  chain.then = terminal.then.bind(terminal)
  chain.catch = terminal.catch.bind(terminal)
  chain.finally = terminal.finally.bind(terminal)
  return chain
}

// Wire withUser(id, fn) → fn(tx). The route calls tx.select twice: 1st = count, 2nd = rows.
function setupOwnerScopedList(opts: {
  total?: number
  rows?: unknown[]
  onWhere?: (arg: unknown) => void
  onOrderBy?: (values: unknown[]) => void
  userId?: number
} = {}) {
  const { total = 2, rows = mockJobRows, onWhere, onOrderBy, userId = 1 } = opts
  vi.mocked(resolveRequestUser).mockResolvedValue({
    ok: true,
    user: { id: userId, issuer: 'https://issuer/', subject: 'sub', principal: {} as never },
  })
  vi.mocked(withUser).mockImplementation(async (_id, fn) => {
    let call = 0
    const tx = {
      select: vi.fn(() => {
        call++
        return call === 1
          ? makeTxChain([{ total }], onWhere)
          : makeTxChain(rows, undefined, onOrderBy)
      }),
    }
    return fn(tx as never)
  })
}

describe('GET /api/jobs (owner-scoped)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupOwnerScopedList()
  })

  it('returns 401 when the user cannot be resolved', async () => {
    vi.mocked(resolveRequestUser).mockResolvedValue({
      ok: false,
      response: NextResponse401(),
    })
    const { GET } = await import('@/app/api/jobs/route')
    const res = await GET(new NextRequest('http://localhost/api/jobs'))
    expect(res.status).toBe(401)
  })

  it('returns 200 with jobs, scope, total, page, and totalPages', async () => {
    const { GET } = await import('@/app/api/jobs/route')
    const res = await GET(new NextRequest('http://localhost/api/jobs'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('jobs')
    expect(json).toHaveProperty('scope', 'tracked')
    expect(json).toHaveProperty('total', 2)
    expect(json).toHaveProperty('page', 1)
    expect(json).toHaveProperty('totalPages')
    expect(Array.isArray(json.jobs)).toBe(true)
    // Flattened rows expose explicit isTracked/isHidden.
    expect(json.jobs[0]).toHaveProperty('isTracked', true)
    expect(json.jobs[0]).toHaveProperty('isHidden', false)
    expect(json.jobs[0]).not.toHaveProperty('stateUserId')
  })

  it('sets Cache-Control: private, no-store on personal responses', async () => {
    const { GET } = await import('@/app/api/jobs/route')
    const res = await GET(new NextRequest('http://localhost/api/jobs'))
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })

  it('defaults scope to tracked and accepts catalog/hidden', async () => {
    const { GET } = await import('@/app/api/jobs/route')
    for (const scope of ['tracked', 'catalog', 'hidden']) {
      setupOwnerScopedList()
      const res = await GET(new NextRequest(`http://localhost/api/jobs?scope=${scope}`))
      expect(res.status).toBe(200)
      expect((await res.json()).scope).toBe(scope)
    }
  })

  it('rejects an invalid scope', async () => {
    const { GET } = await import('@/app/api/jobs/route')
    const res = await GET(new NextRequest('http://localhost/api/jobs?scope=everything'))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: 'Invalid scope: expected tracked, catalog, or hidden',
    })
  })

  it('respects page and limit query params', async () => {
    const { GET } = await import('@/app/api/jobs/route')
    const res = await GET(new NextRequest('http://localhost/api/jobs?page=2&limit=10'))
    expect((await res.json()).page).toBe(2)
  })

  it.each([
    'company', 'role', 'stage', 'location', 'salary', 'found', 'priority', 'clearance',
  ])('accepts sort_by=%s', async (sortBy) => {
    setupOwnerScopedList()
    const { GET } = await import('@/app/api/jobs/route')
    const res = await GET(new NextRequest(`http://localhost/api/jobs?sort_by=${sortBy}&sort_order=asc`))
    expect(res.status).toBe(200)
  })

  it('sorts the stage column against the owner overlay (user_job_state)', async () => {
    let orderBy: unknown[] = []
    setupOwnerScopedList({ onOrderBy: (values) => { orderBy = values } })
    const { GET } = await import('@/app/api/jobs/route')
    const res = await GET(new NextRequest('http://localhost/api/jobs?sort_by=stage&sort_order=asc'))
    expect(res.status).toBe(200)
    expect(sqlText(orderBy[0])).toContain('"user_job_state"."interview_stage" asc nulls last')
  })

  it.each([
    'sort_by=created_at',
    'sort_by=role&sort_order=sideways',
  ])('rejects unsupported sort parameters: %s', async (query) => {
    const { GET } = await import('@/app/api/jobs/route')
    const res = await GET(new NextRequest(`http://localhost/api/jobs?${query}`))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid sort parameters' })
  })

  it('filters stage against user_job_state, not jobs', async () => {
    let whereArg: unknown
    setupOwnerScopedList({ total: 0, rows: [], onWhere: (arg) => { whereArg = arg } })
    const { GET } = await import('@/app/api/jobs/route')
    const res = await GET(new NextRequest('http://localhost/api/jobs?stage=applied'))
    expect(res.status).toBe(200)
    expect(sqlText(whereArg)).toContain('"user_job_state"."interview_stage"')
  })

  it('applies a company_id catalog filter', async () => {
    let whereArg: unknown
    setupOwnerScopedList({ total: 0, rows: [], onWhere: (arg) => { whereArg = arg } })
    const { GET } = await import('@/app/api/jobs/route')
    const res = await GET(new NextRequest('http://localhost/api/jobs?company_id=42'))
    expect(res.status).toBe(200)
    expect(sqlText(whereArg)).toContain('"jobs"."company_id" = $1')
  })

  it.each(['0', '-1', 'abc'])('rejects invalid company_id=%s', async (companyId) => {
    const { GET } = await import('@/app/api/jobs/route')
    const res = await GET(new NextRequest(`http://localhost/api/jobs?company_id=${companyId}`))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid company_id: expected a positive integer' })
  })

  it('rejects malformed taxonomy id filters', async () => {
    const { GET } = await import('@/app/api/jobs/route')
    const res = await GET(new NextRequest('http://localhost/api/jobs?skill_ids=1,nope'))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: 'Invalid skill_ids: expected comma-separated positive integers',
    })
  })
})

describe('POST /api/jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 99 }]),
      }),
    })
  })

  function makeReq(body: unknown) {
    return new NextRequest('http://localhost/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-key' },
      body: JSON.stringify(body),
    })
  }

  const validBody = { job_title: 'Engineer', company_id: 1 }

  it('returns 401 without auth', async () => {
    vi.mocked(resolveAdminUser).mockResolvedValue({ ok: false, response: NextResponse401() })
    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeReq(validBody))
    expect(res.status).toBe(401)
  })

  it('returns 403 (non-disclosing) for a non-admin user', async () => {
    vi.mocked(resolveAdminUser).mockResolvedValue({ ok: false, response: forbidden() })
    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeReq(validBody))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Forbidden' })
  })

  it('returns 400 for invalid body', async () => {
    vi.mocked(resolveAdminUser).mockResolvedValue(adminOk)
    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeReq({ not_job_title: 'bad' }))
    expect(res.status).toBe(400)
  })

  it('returns 201 with job_id on success (admin), with a deprecation header', async () => {
    vi.mocked(resolveAdminUser).mockResolvedValue(adminOk)
    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeReq(validBody))
    expect(res.status).toBe(201)
    expect(await res.json()).toHaveProperty('job_id', 99)
    // Legacy path is a deprecated alias of /api/admin/jobs.
    expect(res.headers.get('deprecation')).toBe('true')
    expect(res.headers.get('link')).toContain('/api/admin/jobs')
  })
})

// Local helper: build a 401 response like resolveRequestUser would return.
function NextResponse401() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
