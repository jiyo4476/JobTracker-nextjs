import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

vi.mock('@/lib/auth', () => ({
  requireApiKey: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}))

import { requireApiKey } from '@/lib/auth'
import { db } from '@/db'

function sqlText(query: unknown): string {
  return new PgDialect().sqlToQuery(query as SQL).sql.replace(/\s+/g, ' ')
}

const mockJobRows = [
  { id: 1, jobTitle: 'Software Engineer', companyName: 'Acme', isRemote: true, interviewStage: 'not_applied' },
  { id: 2, jobTitle: 'Product Manager', companyName: 'Beta Corp', isRemote: false, interviewStage: 'applied' },
]

function makeSelectChain(result: unknown) {
  const chain: Record<string, unknown> = {}
  const terminal = Promise.resolve(result)
  Object.assign(terminal, {
    from: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    offset: vi.fn(() => terminal),
  })
  Object.assign(chain, {
    from: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    offset: vi.fn(() => terminal),
    then: terminal.then.bind(terminal),
    catch: terminal.catch.bind(terminal),
    finally: terminal.finally.bind(terminal),
  })
  return chain
}

function setupSelectMocks(total = 2, rows = mockJobRows) {
  const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
  let callCount = 0
  mockDb.select.mockImplementation(() => {
    callCount++
    if (callCount === 1) {
      // count query — resolves immediately after .where()
      const countChain: Record<string, unknown> = {}
      const countResult = Promise.resolve([{ total }])
      Object.assign(countChain, {
        from: vi.fn(() => countChain),
        leftJoin: vi.fn(() => countChain),
        where: vi.fn(() => countResult),
      })
      return countChain
    }
    return makeSelectChain(rows)
  })
}

describe('GET /api/jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupSelectMocks()
  })

  it('returns 200 with jobs, total, page, and totalPages', async () => {
    const { GET } = await import('@/app/api/jobs/route')
    const res = await GET(new NextRequest('http://localhost/api/jobs'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('jobs')
    expect(json).toHaveProperty('total', 2)
    expect(json).toHaveProperty('page', 1)
    expect(json).toHaveProperty('totalPages')
    expect(Array.isArray(json.jobs)).toBe(true)
  })

  it('respects page and limit query params', async () => {
    const { GET } = await import('@/app/api/jobs/route')
    const res = await GET(new NextRequest('http://localhost/api/jobs?page=2&limit=10'))
    const json = await res.json()
    expect(json.page).toBe(2)
  })

  it('defaults to is_active=true (excludes soft-deleted jobs)', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    let countWhereArg: unknown
    let callCount = 0
    mockDb.select.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        const countChain: Record<string, unknown> = {}
        const countResult = Promise.resolve([{ total: 0 }])
        Object.assign(countChain, {
          from: vi.fn(() => countChain),
          leftJoin: vi.fn(() => countChain),
          where: vi.fn((arg: unknown) => { countWhereArg = arg; return countResult }),
        })
        return countChain
      }
      return makeSelectChain([])
    })

    const { GET } = await import('@/app/api/jobs/route')
    await GET(new NextRequest('http://localhost/api/jobs'))
    // The where clause should have been called (filters applied, including isActive=true)
    expect(countWhereArg).toBeDefined()
  })

  it('accepts ?is_active=false to include soft-deleted jobs', async () => {
    const { GET } = await import('@/app/api/jobs/route')
    const res = await GET(new NextRequest('http://localhost/api/jobs?is_active=false'))
    expect(res.status).toBe(200)
  })

  it('filters by stage param', async () => {
    const { GET } = await import('@/app/api/jobs/route')
    const res = await GET(new NextRequest('http://localhost/api/jobs?stage=applied'))
    expect(res.status).toBe(200)
  })

  it('ignores unknown stage param', async () => {
    const { GET } = await import('@/app/api/jobs/route')
    const res = await GET(new NextRequest('http://localhost/api/jobs?stage=not_a_real_stage'))
    expect(res.status).toBe(200)
  })

  it('filters by platform param', async () => {
    const { GET } = await import('@/app/api/jobs/route')
    const res = await GET(new NextRequest('http://localhost/api/jobs?platform=linkedin'))
    expect(res.status).toBe(200)
  })

  it('filters by is_remote param', async () => {
    const { GET } = await import('@/app/api/jobs/route')
    const res = await GET(new NextRequest('http://localhost/api/jobs?is_remote=true'))
    expect(res.status).toBe(200)
  })

  it('filters by q search param', async () => {
    const { GET } = await import('@/app/api/jobs/route')
    const res = await GET(new NextRequest('http://localhost/api/jobs?q=engineer'))
    expect(res.status).toBe(200)
  })

  it('filters by an exact positive company_id', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    let countWhereArg: unknown
    let callCount = 0
    mockDb.select.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        const countChain: Record<string, unknown> = {}
        const countResult = Promise.resolve([{ total: 0 }])
        Object.assign(countChain, {
          from: vi.fn(() => countChain),
          leftJoin: vi.fn(() => countChain),
          where: vi.fn((arg: unknown) => { countWhereArg = arg; return countResult }),
        })
        return countChain
      }
      return makeSelectChain([])
    })

    const { GET } = await import('@/app/api/jobs/route')
    const res = await GET(new NextRequest('http://localhost/api/jobs?company_id=42&skill_ids=7'))

    expect(res.status).toBe(200)
    const rendered = sqlText(countWhereArg)
    expect(rendered).toContain('"jobs"."company_id" = $1')
    expect(rendered).toContain('"job_skills"')
    expect(rendered).toContain('"jobs"."deleted_at" is null')
  })

  it.each(['0', '-1', '1.5', 'abc', '9007199254740992'])(
    'rejects invalid company_id=%s',
    async (companyId) => {
      const { GET } = await import('@/app/api/jobs/route')
      const res = await GET(new NextRequest(`http://localhost/api/jobs?company_id=${companyId}`))

      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'Invalid company_id: expected a positive integer' })
    },
  )

  it('clamps page to minimum of 1', async () => {
    const { GET } = await import('@/app/api/jobs/route')
    const res = await GET(new NextRequest('http://localhost/api/jobs?page=-5'))
    const json = await res.json()
    expect(json.page).toBe(1)
  })

  it('filters by security_clearance=true param', async () => {
    const { GET } = await import('@/app/api/jobs/route')
    const res = await GET(new NextRequest('http://localhost/api/jobs?security_clearance=true'))
    expect(res.status).toBe(200)
  })

  it('filters by security_clearance=false param', async () => {
    const { GET } = await import('@/app/api/jobs/route')
    const res = await GET(new NextRequest('http://localhost/api/jobs?security_clearance=false'))
    expect(res.status).toBe(200)
  })

  it('filters by experience_level param', async () => {
    const { GET } = await import('@/app/api/jobs/route')
    const res = await GET(new NextRequest('http://localhost/api/jobs?experience_level=senior'))
    expect(res.status).toBe(200)
  })

  it('ignores unknown experience_level param', async () => {
    const { GET } = await import('@/app/api/jobs/route')
    const res = await GET(new NextRequest('http://localhost/api/jobs?experience_level=not_a_level'))
    expect(res.status).toBe(200)
  })

  it.each([
    ['skill_ids', 'job_skills', 'skill_id'],
    ['software_ids', 'job_software', 'software_id'],
    ['certification_ids', 'job_certifications', 'certification_id'],
    ['keyword_ids', 'job_keywords', 'keyword_id'],
  ])('filters %s through only its category junction', async (param, table, column) => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    let countWhereArg: unknown
    let callCount = 0
    mockDb.select.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        const countChain: Record<string, unknown> = {}
        const countResult = Promise.resolve([{ total: 0 }])
        Object.assign(countChain, {
          from: vi.fn(() => countChain),
          leftJoin: vi.fn(() => countChain),
          where: vi.fn((arg: unknown) => { countWhereArg = arg; return countResult }),
        })
        return countChain
      }
      return makeSelectChain([])
    })

    const { GET } = await import('@/app/api/jobs/route')
    const res = await GET(new NextRequest(`http://localhost/api/jobs?${param}=1,2`))
    expect(res.status).toBe(200)
    const rendered = sqlText(countWhereArg)
    expect(rendered).toContain(`"${table}"`)
    expect(rendered).toContain(`"${column}"`)
    expect(rendered).toContain('ANY(ARRAY[')
  })

  it('combines populated taxonomy categories with independent EXISTS clauses', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    let countWhereArg: unknown
    let callCount = 0
    mockDb.select.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        const countChain: Record<string, unknown> = {}
        const countResult = Promise.resolve([{ total: 0 }])
        Object.assign(countChain, {
          from: vi.fn(() => countChain),
          leftJoin: vi.fn(() => countChain),
          where: vi.fn((arg: unknown) => { countWhereArg = arg; return countResult }),
        })
        return countChain
      }
      return makeSelectChain([])
    })

    const { GET } = await import('@/app/api/jobs/route')
    await GET(new NextRequest('http://localhost/api/jobs?skill_ids=1&software_ids=2'))
    const rendered = sqlText(countWhereArg)
    expect(rendered.match(/EXISTS/g)).toHaveLength(2)
    expect(rendered).toContain('"job_skills"')
    expect(rendered).toContain('"job_software"')
  })

  it.each(['skill_ids', 'software_ids', 'certification_ids', 'keyword_ids'])(
    'rejects malformed %s instead of silently dropping values',
    async (param) => {
      const { GET } = await import('@/app/api/jobs/route')
      const res = await GET(new NextRequest(`http://localhost/api/jobs?${param}=1,nope`))
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({
        error: `Invalid ${param}: expected comma-separated positive integers`,
      })
    },
  )
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
    vi.mocked(requireApiKey).mockResolvedValue(false)
    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeReq(validBody))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid body', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeReq({ not_job_title: 'bad' }))
    expect(res.status).toBe(400)
  })

  it('returns 201 with job_id on success', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeReq(validBody))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json).toHaveProperty('job_id', 99)
  })
})
