import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db', () => ({
  db: { select: vi.fn() },
}))

vi.mock('@/db/schema', () => ({
  jobs: {},
  skills: {},
  jobSkills: {},
}))

import { db } from '@/db'

function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {}
  const terminal = Promise.resolve(result)
  const methods = ['from', 'leftJoin', 'innerJoin', 'where', 'orderBy', 'limit', 'offset', 'groupBy', 'set', 'values', 'returning']
  methods.forEach(m => { chain[m] = vi.fn(() => chain) })
  chain.then = terminal.then.bind(terminal)
  chain.catch = terminal.catch.bind(terminal)
  return chain
}

describe('GET /api/stats', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    let callCount = 0

    mockDb.select.mockImplementation(() => {
      callCount++
      const n = callCount
      if (n === 1) return makeChain([{ totalJobs: 42 }])
      if (n === 2) return makeChain([{ applied: 10 }])
      if (n === 3) return makeChain([{ activeInterviews: 3 }])
      if (n === 4) return makeChain([{ staleListings: 5 }])
      if (n === 5) return makeChain([{ name: 'TypeScript', jobCount: 20 }])
      if (n === 6) return makeChain([{ week: '2024-01-01', jobCount: 7 }])
      if (n === 7) return makeChain([{ remoteCount: 30 }])
      if (n === 8) return makeChain([{ onsiteCount: 12 }])
      return makeChain([{ stage: 'applied', count: 10 }])
    })
  })

  it('returns 200 with all expected shape keys', async () => {
    const { GET } = await import('@/app/api/stats/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('totalJobs', 42)
    expect(json).toHaveProperty('applied', 10)
    expect(json).toHaveProperty('activeInterviews', 3)
    expect(json).toHaveProperty('staleListings', 5)
    expect(json).toHaveProperty('topSkills')
    expect(json).toHaveProperty('weeklyJobCounts')
    expect(json).toHaveProperty('remoteCount', 30)
    expect(json).toHaveProperty('onsiteCount', 12)
    expect(json).toHaveProperty('stageCounts')
  })

  it('topSkills is an array', async () => {
    const { GET } = await import('@/app/api/stats/route')
    const res = await GET()
    const json = await res.json()
    expect(Array.isArray(json.topSkills)).toBe(true)
  })

  it('weeklyJobCounts is an array', async () => {
    const { GET } = await import('@/app/api/stats/route')
    const res = await GET()
    const json = await res.json()
    expect(Array.isArray(json.weeklyJobCounts)).toBe(true)
  })

  it('stageCounts is an array', async () => {
    const { GET } = await import('@/app/api/stats/route')
    const res = await GET()
    const json = await res.json()
    expect(Array.isArray(json.stageCounts)).toBe(true)
  })

  it('sets Cache-Control header', async () => {
    const { GET } = await import('@/app/api/stats/route')
    const res = await GET()
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=60')
  })
})
