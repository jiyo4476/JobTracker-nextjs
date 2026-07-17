import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { PgDialect } from 'drizzle-orm/pg-core'

vi.mock('@/lib/auth', () => ({
  requireApiKey: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: { select: vi.fn(), update: vi.fn(), execute: vi.fn() },
}))

import { requireApiKey } from '@/lib/auth'
import { db } from '@/db'

function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {}
  const terminal = Promise.resolve(result)
  const methods = ['from', 'leftJoin', 'where', 'groupBy', 'orderBy', 'limit', 'set']
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
  id: 1,
  name: 'Acme',
  website: 'https://acme.com',
  industry: 'Tech',
  sizeRange: '51-200',
  hqLocation: 'NYC',
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
    const json = await res.json()
    expect(Array.isArray(json)).toBe(true)
  })
})

describe('GET /api/companies/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.execute.mockResolvedValue([])
  })

  it('returns 400 for non-numeric id', async () => {
    const { GET } = await import('@/app/api/companies/[id]/route')
    const req = new NextRequest('http://localhost/api/companies/abc')
    const res = await GET(req, { params: Promise.resolve({ id: 'abc' }) })
    expect(res.status).toBe(400)
  })

  it('returns 404 for unknown id', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    let callCount = 0
    mockDb.select.mockImplementation(() => {
      callCount++
      if (callCount === 1) return makeChain([])
      return makeChain([])
    })

    const { GET } = await import('@/app/api/companies/[id]/route')
    const req = new NextRequest('http://localhost/api/companies/999')
    const res = await GET(req, { params: Promise.resolve({ id: '999' }) })
    expect(res.status).toBe(404)
  })

  it('returns 200 with company and jobs for known id', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    let callCount = 0
    mockDb.select.mockImplementation(() => {
      callCount++
      if (callCount === 1) return makeChain([mockCompany])
      return makeChain([{ id: 10, jobTitle: 'Engineer' }])
    })
    mockDb.execute
      .mockResolvedValueOnce([{ count: 2 }])
      .mockResolvedValueOnce([{ id: 1, name: 'TypeScript', jobCount: 2 }])
      .mockResolvedValueOnce([{ id: 2, name: 'Docker', jobCount: 1 }])
      .mockResolvedValueOnce([{ id: 3, name: 'AWS Certified', jobCount: 1 }])
      .mockResolvedValueOnce([{ id: 4, name: 'Remote', jobCount: 2 }])

    const { GET } = await import('@/app/api/companies/[id]/route')
    const req = new NextRequest('http://localhost/api/companies/1')
    const res = await GET(req, { params: Promise.resolve({ id: '1' }) })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('name', 'Acme')
    expect(json).toHaveProperty('sizeRange', '51-200')
    expect(json).toHaveProperty('jobs')
    expect(Array.isArray(json.jobs)).toBe(true)
    expect(json.taxonomyDemand).toEqual({
      activeJobCount: 2,
      skills: [{ id: 1, name: 'TypeScript', jobCount: 2 }],
      software: [{ id: 2, name: 'Docker', jobCount: 1 }],
      certifications: [{ id: 3, name: 'AWS Certified', jobCount: 1 }],
      keywords: [{ id: 4, name: 'Remote', jobCount: 2 }],
      truncated: { skills: false, software: false, certifications: false, keywords: false },
    })
  })

  it('applies a limit of 50 to the linked jobs query', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    let callCount = 0
    const jobsChain = makeChain([])
    mockDb.select.mockImplementation(() => {
      callCount++
      if (callCount === 1) return makeChain([mockCompany])
      return jobsChain
    })
    mockDb.execute.mockResolvedValue([])

    const { GET } = await import('@/app/api/companies/[id]/route')
    const req = new NextRequest('http://localhost/api/companies/1')
    await GET(req, { params: Promise.resolve({ id: '1' }) })

    const limitSpy = jobsChain.limit as ReturnType<typeof vi.fn>
    expect(limitSpy).toHaveBeenCalledWith(50)
  })

  it('compiles a bounded PostgreSQL query that excludes inactive, deleted, and duplicate assignments', async () => {
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
    let callCount = 0
    mockDb.select.mockImplementation(() => {
      callCount++
      if (callCount === 1) return makeChain([mockCompany])
      return makeChain([])
    })
    const skillRows = Array.from({ length: 11 }, (_, index) => ({
      id: index + 1,
      name: `Skill ${index + 1}`,
      jobCount: 11 - index,
    }))
    mockDb.execute
      .mockResolvedValueOnce([{ count: 12 }])
      .mockResolvedValueOnce(skillRows)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const { GET } = await import('@/app/api/companies/[id]/route')
    const res = await GET(new NextRequest('http://localhost/api/companies/1'), {
      params: Promise.resolve({ id: '1' }),
    })
    const json = await res.json()

    expect(json.taxonomyDemand.skills).toHaveLength(10)
    expect(json.taxonomyDemand.skills.at(-1)).toEqual({ id: 10, name: 'Skill 10', jobCount: 2 })
    expect(json.taxonomyDemand.truncated).toEqual({
      skills: true,
      software: false,
      certifications: false,
      keywords: false,
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
    vi.mocked(requireApiKey).mockResolvedValue(false)
    const { PATCH } = await import('@/app/api/companies/[id]/route')
    const res = await PATCH(makeReq({ name: 'New Name' }, false), { params: Promise.resolve({ id: '1' }) })
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid body', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const { PATCH } = await import('@/app/api/companies/[id]/route')
    const res = await PATCH(makeReq({ name: 123 }), { params: Promise.resolve({ id: '1' }) })
    expect(res.status).toBe(400)
  })

  it('rejects camelCase fields instead of silently ignoring them', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const { PATCH } = await import('@/app/api/companies/[id]/route')
    const res = await PATCH(makeReq({ linkedinUrl: 'https://linkedin.com/company/acme' }), { params: Promise.resolve({ id: '1' }) })
    expect(res.status).toBe(400)
  })

  it('returns 200 on success', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.update.mockReturnValue(makeUpdateChain())

    const { PATCH } = await import('@/app/api/companies/[id]/route')
    const res = await PATCH(makeReq({ name: 'Updated Corp' }), { params: Promise.resolve({ id: '1' }) })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('success', true)
  })

  it('allows optional company fields to be cleared', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    const updateChain = makeUpdateChain()
    mockDb.update.mockReturnValue(updateChain)

    const { PATCH } = await import('@/app/api/companies/[id]/route')
    const res = await PATCH(makeReq({ website: null, notes: null }), { params: Promise.resolve({ id: '1' }) })

    expect(res.status).toBe(200)
    expect(updateChain.set).toHaveBeenCalledWith(expect.objectContaining({ website: null, notes: null }))
  })

  it('maps the snake_case company size field to the database column', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    const updateChain = makeUpdateChain()
    mockDb.update.mockReturnValue(updateChain)

    const { PATCH } = await import('@/app/api/companies/[id]/route')
    const res = await PATCH(makeReq({ size_range: '51-200' }), { params: Promise.resolve({ id: '1' }) })

    expect(res.status).toBe(200)
    expect(updateChain.set).toHaveBeenCalledWith(expect.objectContaining({ sizeRange: '51-200' }))
  })

  it('returns 400 for non-numeric id', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const { PATCH } = await import('@/app/api/companies/[id]/route')
    const res = await PATCH(makeReq({ name: 'X' }), { params: Promise.resolve({ id: 'nan' }) })
    expect(res.status).toBe(400)
  })
})
