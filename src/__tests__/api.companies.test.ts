import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

vi.mock('@/lib/auth', () => ({
  requireAuthentication: vi.fn(),
}))

vi.mock('@/lib/resolved-user', () => ({
  resolveRequestUser: vi.fn(),
}))

vi.mock('@/db/session', () => ({
  withUser: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: { select: vi.fn(), update: vi.fn(), execute: vi.fn() },
}))

import { requireAuthentication } from '@/lib/auth'
import { resolveRequestUser } from '@/lib/resolved-user'
import { withUser } from '@/db/session'
import { db } from '@/db'

function renderParams(query: unknown): unknown[] {
  return new PgDialect().sqlToQuery(query as SQL).params
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

function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {}
  const terminal = Promise.resolve(result)
  const methods = ['from', 'leftJoin', 'innerJoin', 'where', 'groupBy', 'orderBy', 'limit', 'offset', 'set']
  methods.forEach(m => { chain[m] = vi.fn(() => chain) })
  chain.then = terminal.then.bind(terminal)
  chain.catch = terminal.catch.bind(terminal)
  return chain
}

function makeUpdateChain() {
  const chain: Record<string, unknown> = {}
  const methods = ['set', 'where']
  methods.forEach(m => { chain[m] = vi.fn(() => chain) })
  chain.then = Promise.resolve(undefined).then.bind(Promise.resolve(undefined))
  chain.catch = Promise.resolve(undefined).catch.bind(Promise.resolve(undefined))
  return chain
}

const mockCompany = {
  id: 1, name: 'Acme', website: 'https://acme.com', industry: 'Tech',
  sizeRange: '51-200', hqLocation: 'NYC',
}

describe('GET /api/companies', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.select.mockReturnValue(makeChain([mockCompany]))
  })

  it('returns 200 with an array', async () => {
    const { GET } = await import('@/app/api/companies/route')
    const res = await GET()
    expect(res.status).toBe(200)
    expect(Array.isArray(await res.json())).toBe(true)
  })

  it('bounds the query with a default limit and zero offset', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    const chain = makeChain([mockCompany])
    mockDb.select.mockReturnValue(chain)
    const { GET } = await import('@/app/api/companies/route')
    await GET()
    expect(chain.limit).toHaveBeenCalledWith(500)
    expect(chain.offset).toHaveBeenCalledWith(0)
  })

  it('honors ?limit and ?page query params', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    const chain = makeChain([mockCompany])
    mockDb.select.mockReturnValue(chain)
    const { GET } = await import('@/app/api/companies/route')
    await GET(new NextRequest('http://localhost/api/companies?limit=50&page=2'))
    expect(chain.limit).toHaveBeenCalledWith(50)
    expect(chain.offset).toHaveBeenCalledWith(50)
  })
})

// GET /api/companies/[id] is now owner-scoped: catalog facts stay global, but each
// listed job's interview stage and the trackedJobCount come from the caller's
// user_job_state. Company lookup uses db.select; the personal overlay reads run in a
// withUser tx; taxonomy demand uses db.execute.
type DetailCapture = { jobsLeftJoin?: unknown; countWhere?: unknown }

function setupDetail(opts: {
  company?: unknown[]
  jobRows?: unknown[]
  trackedCount?: number
  capture?: DetailCapture
} = {}) {
  const { company = [mockCompany], jobRows = [{ id: 10, jobTitle: 'Engineer', interviewStage: 'applied', stateUserId: 5 }], trackedCount = 1, capture = {} } = opts
  const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
  mockDb.select.mockReturnValue(makeChain(company))

  vi.mocked(withUser).mockImplementation(async (_id, fn) => {
    const queue: unknown[][] = [jobRows, [{ count: trackedCount }]]
    let i = 0
    const tx = {
      select: vi.fn(() => {
        const result = queue[i++] ?? []
        const chain: Record<string, unknown> = {}
        const terminal = Promise.resolve(result)
        for (const m of ['from', 'innerJoin', 'orderBy', 'limit']) chain[m] = vi.fn(() => chain)
        chain.leftJoin = vi.fn((_t: unknown, cond: unknown) => { capture.jobsLeftJoin = cond; return chain })
        chain.where = vi.fn((cond: unknown) => { capture.countWhere = cond; return chain })
        chain.then = terminal.then.bind(terminal)
        chain.catch = terminal.catch.bind(terminal)
        chain.finally = terminal.finally.bind(terminal)
        return chain
      }),
    }
    return fn(tx as never)
  })
}

describe('GET /api/companies/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveAs(1)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.execute.mockResolvedValue([])
    setupDetail()
  })

  it('returns 401 when the user cannot be resolved', async () => {
    resolveDenied()
    const { GET } = await import('@/app/api/companies/[id]/route')
    const res = await GET(new NextRequest('http://localhost/api/companies/1'), { params: Promise.resolve({ id: '1' }) })
    expect(res.status).toBe(401)
  })

  it('returns 400 for non-numeric id', async () => {
    const { GET } = await import('@/app/api/companies/[id]/route')
    const res = await GET(new NextRequest('http://localhost/api/companies/abc'), { params: Promise.resolve({ id: 'abc' }) })
    expect(res.status).toBe(400)
  })

  it('returns 404 for unknown id', async () => {
    setupDetail({ company: [] })
    const { GET } = await import('@/app/api/companies/[id]/route')
    const res = await GET(new NextRequest('http://localhost/api/companies/999'), { params: Promise.resolve({ id: '999' }) })
    expect(res.status).toBe(404)
  })

  it('returns 200 with company, personal job stages, and catalog taxonomy demand', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.execute
      .mockResolvedValueOnce([{ count: 2 }])
      .mockResolvedValueOnce([{ id: 1, name: 'TypeScript', jobCount: 2 }])
      .mockResolvedValueOnce([{ id: 2, name: 'Docker', jobCount: 1 }])
      .mockResolvedValueOnce([{ id: 3, name: 'AWS Certified', jobCount: 1 }])
      .mockResolvedValueOnce([{ id: 4, name: 'Remote', jobCount: 2 }])

    const { GET } = await import('@/app/api/companies/[id]/route')
    const res = await GET(new NextRequest('http://localhost/api/companies/1'), { params: Promise.resolve({ id: '1' }) })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    const json = await res.json()
    expect(json).toHaveProperty('name', 'Acme')
    expect(json).toHaveProperty('trackedJobCount', 1)
    // Personal per-job stage is derived from the caller's state; isTracked reflects it.
    expect(json.jobs[0]).toMatchObject({ interviewStage: 'applied', isTracked: true })
    expect(json.taxonomyDemand).toEqual({
      activeJobCount: 2,
      skills: [{ id: 1, name: 'TypeScript', jobCount: 2 }],
      software: [{ id: 2, name: 'Docker', jobCount: 1 }],
      certifications: [{ id: 3, name: 'AWS Certified', jobCount: 1 }],
      keywords: [{ id: 4, name: 'Remote', jobCount: 2 }],
      truncated: { skills: false, software: false, certifications: false, keywords: false },
    })
  })

  it('marks an untracked job (no caller state) as isTracked=false', async () => {
    setupDetail({ jobRows: [{ id: 10, jobTitle: 'Engineer', interviewStage: null, stateUserId: null }] })
    const { GET } = await import('@/app/api/companies/[id]/route')
    const res = await GET(new NextRequest('http://localhost/api/companies/1'), { params: Promise.resolve({ id: '1' }) })
    const json = await res.json()
    expect(json.jobs[0]).toMatchObject({ interviewStage: null, isTracked: false })
  })

  it('scopes the personal overlay to the caller (two-user isolation)', async () => {
    const capture: DetailCapture = {}
    resolveAs(2)
    setupDetail({ capture })
    // Use company id 9 so the bound company id can't be confused with a user id.
    const { GET } = await import('@/app/api/companies/[id]/route')
    await GET(new NextRequest('http://localhost/api/companies/9'), { params: Promise.resolve({ id: '9' }) })
    // Owner id is pinned INSIDE the leftJoin condition so a catalog job can never
    // match another user's state row.
    expect(renderParams(capture.jobsLeftJoin)).toContain(2)
    expect(renderParams(capture.jobsLeftJoin)).not.toContain(1)
    // The tracked-count query also binds the caller (2), never another user (1).
    expect(renderParams(capture.countWhere)).toContain(2)
    expect(renderParams(capture.countWhere)).not.toContain(1)
  })

  it('compiles a bounded PostgreSQL demand query that excludes inactive, deleted, and duplicate assignments', async () => {
    const { buildCompanyDemandQuery } = await import('@/lib/company-taxonomy-demand')
    const compiled = new PgDialect().sqlToQuery(buildCompanyDemandQuery('skills', 7))
    expect(compiled.sql).toContain('COUNT(DISTINCT "job_skills"."job_id")')
    expect(compiled.sql).toContain('"jobs"."is_active" IS TRUE')
    expect(compiled.sql).toContain('"jobs"."deleted_at" IS NULL')
    expect(compiled.sql).toContain('LIMIT $2')
    expect(compiled.params).toEqual([7, 11])
  })

  it('returns only the ten most common values and marks an overflowing category as truncated', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    const skillRows = Array.from({ length: 11 }, (_, index) => ({
      id: index + 1, name: `Skill ${index + 1}`, jobCount: 11 - index,
    }))
    mockDb.execute
      .mockResolvedValueOnce([{ count: 12 }])
      .mockResolvedValueOnce(skillRows)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const { GET } = await import('@/app/api/companies/[id]/route')
    const res = await GET(new NextRequest('http://localhost/api/companies/1'), { params: Promise.resolve({ id: '1' }) })
    const json = await res.json()
    expect(json.taxonomyDemand.skills).toHaveLength(10)
    expect(json.taxonomyDemand.skills.at(-1)).toEqual({ id: 10, name: 'Skill 10', jobCount: 2 })
    expect(json.taxonomyDemand.truncated).toEqual({
      skills: true, software: false, certifications: false, keywords: false,
    })
  })
})

describe('PATCH /api/companies/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function makeReq(body: unknown, auth = true) {
    return new NextRequest('http://localhost/api/companies/1', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        ...(auth ? { authorization: 'Bearer test-key' } : {}),
      },
      body: JSON.stringify(body),
    })
  }

  it('returns 401 without auth', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(false)
    const { PATCH } = await import('@/app/api/companies/[id]/route')
    const res = await PATCH(makeReq({ name: 'New Name' }, false), { params: Promise.resolve({ id: '1' }) })
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid body', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    const { PATCH } = await import('@/app/api/companies/[id]/route')
    const res = await PATCH(makeReq({ name: 123 }), { params: Promise.resolve({ id: '1' }) })
    expect(res.status).toBe(400)
  })

  it('rejects camelCase fields instead of silently ignoring them', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    const { PATCH } = await import('@/app/api/companies/[id]/route')
    const res = await PATCH(makeReq({ linkedinUrl: 'https://linkedin.com/company/acme' }), { params: Promise.resolve({ id: '1' }) })
    expect(res.status).toBe(400)
  })

  it('returns 200 on success', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.update.mockReturnValue(makeUpdateChain())
    const { PATCH } = await import('@/app/api/companies/[id]/route')
    const res = await PATCH(makeReq({ name: 'Updated Corp' }), { params: Promise.resolve({ id: '1' }) })
    expect(res.status).toBe(200)
    expect(await res.json()).toHaveProperty('success', true)
  })

  it('allows optional company fields to be cleared', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    const updateChain = makeUpdateChain()
    mockDb.update.mockReturnValue(updateChain)
    const { PATCH } = await import('@/app/api/companies/[id]/route')
    const res = await PATCH(makeReq({ website: null, notes: null }), { params: Promise.resolve({ id: '1' }) })
    expect(res.status).toBe(200)
    expect(updateChain.set).toHaveBeenCalledWith(expect.objectContaining({ website: null, notes: null }))
  })

  it('maps the snake_case company size field to the database column', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    const updateChain = makeUpdateChain()
    mockDb.update.mockReturnValue(updateChain)
    const { PATCH } = await import('@/app/api/companies/[id]/route')
    const res = await PATCH(makeReq({ size_range: '51-200' }), { params: Promise.resolve({ id: '1' }) })
    expect(res.status).toBe(200)
    expect(updateChain.set).toHaveBeenCalledWith(expect.objectContaining({ sizeRange: '51-200' }))
  })

  it('returns 400 for non-numeric id', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    const { PATCH } = await import('@/app/api/companies/[id]/route')
    const res = await PATCH(makeReq({ name: 'X' }), { params: Promise.resolve({ id: 'nan' }) })
    expect(res.status).toBe(400)
  })
})
