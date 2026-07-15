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
  let chains: Record<string, unknown>[]

  beforeEach(() => {
    vi.clearAllMocks()
    chains = []

    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    let callCount = 0

    mockDb.select.mockImplementation(() => {
      callCount++
      const n = callCount
      let chain: Record<string, unknown>
      if (n === 1) chain = makeChain([{ totalJobs: 42 }])
      else if (n === 2) chain = makeChain([{ applied: 10 }])
      else if (n === 3) chain = makeChain([{ activeInterviews: 3 }])
      else if (n === 4) chain = makeChain([{ staleListings: 5 }])
      else if (n === 5) chain = makeChain([{ name: 'TypeScript', jobCount: 20 }])
      else if (n === 6) chain = makeChain([{ week: '2024-01-01', jobCount: 7 }])
      else if (n === 7) chain = makeChain([{ remoteCount: 30 }])
      else if (n === 8) chain = makeChain([{ onsiteCount: 12 }])
      else chain = makeChain([{ stage: 'applied', count: 10 }])
      chains.push(chain)
      return chain
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

  it('filters soft-deleted jobs out of every aggregate', async () => {
    const { GET } = await import('@/app/api/stats/route')
    await GET()
    expect(chains).toHaveLength(9)
    // Every jobs-based aggregate applies a where clause; topSkills (index 4)
    // carries the active-jobs filter in its second leftJoin instead.
    const whereChainIndexes = [0, 1, 2, 3, 5, 6, 7, 8]
    for (const i of whereChainIndexes) {
      expect(chains[i].where, `chain ${i} missing where`).toHaveBeenCalled()
    }
    expect(chains[4].leftJoin).toHaveBeenCalledTimes(2)
  })

  it('sets Cache-Control header', async () => {
    const { GET } = await import('@/app/api/stats/route')
    const res = await GET()
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=60')
  })
})
