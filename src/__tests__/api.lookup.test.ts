import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/db', () => ({
  db: { select: vi.fn() },
}))

vi.mock('@/db/schema', () => ({
  skills: { id: 'skills.id' },
  jobSkills: {},
  software: { id: 'software.id' },
  jobSoftware: {},
  certifications: { id: 'certifications.id' },
  jobCertifications: {},
}))

import { db } from '@/db'
import { DEFAULT_LIST_LIMIT } from '@/lib/http'

function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {}
  const terminal = Promise.resolve(result)
  const methods = ['from', 'leftJoin', 'where', 'groupBy', 'orderBy', 'limit', 'offset']
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

// ---------------------------------------------------------------------------
// Bounded list pagination (shared across skills/software/certifications)
// ---------------------------------------------------------------------------
describe('lookup list endpoints are bounded', () => {
  const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it.each([
    ['skills', '@/app/api/skills/route'],
    ['software', '@/app/api/software/route'],
    ['certifications', '@/app/api/certifications/route'],
  ])('%s applies the default hard limit when no params are passed', async (_name, modulePath) => {
    const chain = makeChain([])
    mockDb.select.mockReturnValue(chain)
    const { GET } = await import(modulePath)
    await GET()
    expect(chain.limit).toHaveBeenCalledWith(DEFAULT_LIST_LIMIT)
    expect(chain.offset).toHaveBeenCalledWith(0)
  })

  it('honors ?limit and ?page, clamping limit to the max', async () => {
    const chain = makeChain([])
    mockDb.select.mockReturnValue(chain)
    const { GET } = await import('@/app/api/skills/route')
    // limit=9999 is clamped to the 500 cap; page=3 → offset = (3-1)*500
    await GET(new NextRequest('http://localhost/api/skills?limit=9999&page=3'))
    expect(chain.limit).toHaveBeenCalledWith(500)
    expect(chain.offset).toHaveBeenCalledWith(1000)
  })

  it('falls back to the default limit for non-numeric input instead of erroring', async () => {
    const chain = makeChain([])
    mockDb.select.mockReturnValue(chain)
    const { GET } = await import('@/app/api/skills/route')
    const res = await GET(new NextRequest('http://localhost/api/skills?limit=abc&page=-4'))
    expect(res.status).toBe(200)
    expect(chain.limit).toHaveBeenCalledWith(DEFAULT_LIST_LIMIT)
    expect(chain.offset).toHaveBeenCalledWith(0)
  })
})
