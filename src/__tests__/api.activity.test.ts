import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db', () => ({
  db: { select: vi.fn() },
}))

vi.mock('@/db/schema', () => ({
  jobStatusHistory: {},
  jobs: {},
  companies: {},
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

const mockRows = [
  {
    id: 1,
    jobId: 10,
    jobTitle: 'Software Engineer',
    companyName: 'Acme Corp',
    fromStage: 'applied',
    toStage: 'phone_screen',
    changedAt: new Date('2024-03-01T12:00:00Z'),
  },
  {
    id: 2,
    jobId: 11,
    jobTitle: 'Backend Developer',
    companyName: null,
    fromStage: null,
    toStage: 'applied',
    changedAt: new Date('2024-03-02T08:30:00Z'),
  },
]

describe('GET /api/activity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.select.mockReturnValue(makeChain(mockRows))
  })

  it('returns 200 with activity rows', async () => {
    const { GET } = await import('@/app/api/activity/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json)).toBe(true)
    expect(json).toHaveLength(2)
  })

  it('maps row fields correctly', async () => {
    const { GET } = await import('@/app/api/activity/route')
    const res = await GET()
    const json = await res.json()
    expect(json[0]).toMatchObject({
      id: 1,
      jobId: 10,
      jobTitle: 'Software Engineer',
      companyName: 'Acme Corp',
      fromStage: 'applied',
      toStage: 'phone_screen',
      changedAt: '2024-03-01T12:00:00.000Z',
    })
  })

  it('handles null companyName and fromStage', async () => {
    const { GET } = await import('@/app/api/activity/route')
    const res = await GET()
    const json = await res.json()
    expect(json[1].companyName).toBeNull()
    expect(json[1].fromStage).toBeNull()
  })

  it('sets Cache-Control header', async () => {
    const { GET } = await import('@/app/api/activity/route')
    const res = await GET()
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=30')
  })

  it('returns empty array when no rows', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.select.mockReturnValue(makeChain([]))
    const { GET } = await import('@/app/api/activity/route')
    const res = await GET()
    const json = await res.json()
    expect(json).toEqual([])
  })
})
