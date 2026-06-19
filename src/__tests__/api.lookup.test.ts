import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db', () => ({
  db: { select: vi.fn() },
}))

vi.mock('@/db/schema', () => ({
  skills: {},
  jobSkills: {},
  software: {},
  jobSoftware: {},
  certifications: {},
  jobCertifications: {},
}))

import { db } from '@/db'

function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {}
  const terminal = Promise.resolve(result)
  const methods = ['from', 'leftJoin', 'where', 'groupBy', 'orderBy', 'limit']
  methods.forEach(m => { chain[m] = vi.fn(() => chain) })
  chain.then = terminal.then.bind(terminal)
  chain.catch = terminal.catch.bind(terminal)
  return chain
}

// ---------------------------------------------------------------------------
// GET /api/skills
// ---------------------------------------------------------------------------
describe('GET /api/skills', () => {
  const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('returns 200 with an array', async () => {
    mockDb.select.mockReturnValue(makeChain([]))
    const { GET } = await import('@/app/api/skills/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json)).toBe(true)
  })

  it('returns the rows from the DB', async () => {
    const rows = [
      { id: 1, name: 'TypeScript', jobCount: 5 },
      { id: 2, name: 'React', jobCount: 3 },
    ]
    mockDb.select.mockReturnValue(makeChain(rows))
    const { GET } = await import('@/app/api/skills/route')
    const res = await GET()
    const json = await res.json()
    expect(json).toEqual(rows)
  })

  it('array items have id, name, jobCount shape', async () => {
    const rows = [{ id: 1, name: 'TypeScript', jobCount: 5 }]
    mockDb.select.mockReturnValue(makeChain(rows))
    const { GET } = await import('@/app/api/skills/route')
    const res = await GET()
    const json = await res.json()
    expect(json[0]).toHaveProperty('id')
    expect(json[0]).toHaveProperty('name')
    expect(json[0]).toHaveProperty('jobCount')
  })

  it('returns empty array when DB returns nothing', async () => {
    mockDb.select.mockReturnValue(makeChain([]))
    const { GET } = await import('@/app/api/skills/route')
    const res = await GET()
    const json = await res.json()
    expect(json).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// GET /api/software
// ---------------------------------------------------------------------------
describe('GET /api/software', () => {
  const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('returns 200 with an array', async () => {
    mockDb.select.mockReturnValue(makeChain([]))
    const { GET } = await import('@/app/api/software/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json)).toBe(true)
  })

  it('returns the rows from the DB', async () => {
    const rows = [
      { id: 1, name: 'VSCode', jobCount: 8 },
      { id: 2, name: 'Docker', jobCount: 6 },
    ]
    mockDb.select.mockReturnValue(makeChain(rows))
    const { GET } = await import('@/app/api/software/route')
    const res = await GET()
    const json = await res.json()
    expect(json).toEqual(rows)
  })

  it('array items have id, name, jobCount shape', async () => {
    const rows = [{ id: 1, name: 'VSCode', jobCount: 8 }]
    mockDb.select.mockReturnValue(makeChain(rows))
    const { GET } = await import('@/app/api/software/route')
    const res = await GET()
    const json = await res.json()
    expect(json[0]).toHaveProperty('id')
    expect(json[0]).toHaveProperty('name')
    expect(json[0]).toHaveProperty('jobCount')
  })

  it('returns empty array when DB returns nothing', async () => {
    mockDb.select.mockReturnValue(makeChain([]))
    const { GET } = await import('@/app/api/software/route')
    const res = await GET()
    const json = await res.json()
    expect(json).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// GET /api/certifications
// ---------------------------------------------------------------------------
describe('GET /api/certifications', () => {
  const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('returns 200 with an array', async () => {
    mockDb.select.mockReturnValue(makeChain([]))
    const { GET } = await import('@/app/api/certifications/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json)).toBe(true)
  })

  it('returns the rows from the DB', async () => {
    const rows = [
      { id: 1, name: 'AWS Solutions Architect', jobCount: 12 },
      { id: 2, name: 'CPA', jobCount: 4 },
    ]
    mockDb.select.mockReturnValue(makeChain(rows))
    const { GET } = await import('@/app/api/certifications/route')
    const res = await GET()
    const json = await res.json()
    expect(json).toEqual(rows)
  })

  it('array items have id, name, jobCount shape', async () => {
    const rows = [{ id: 1, name: 'AWS Solutions Architect', jobCount: 12 }]
    mockDb.select.mockReturnValue(makeChain(rows))
    const { GET } = await import('@/app/api/certifications/route')
    const res = await GET()
    const json = await res.json()
    expect(json[0]).toHaveProperty('id')
    expect(json[0]).toHaveProperty('name')
    expect(json[0]).toHaveProperty('jobCount')
  })

  it('returns empty array when DB returns nothing', async () => {
    mockDb.select.mockReturnValue(makeChain([]))
    const { GET } = await import('@/app/api/certifications/route')
    const res = await GET()
    const json = await res.json()
    expect(json).toEqual([])
  })
})
