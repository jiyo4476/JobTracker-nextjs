import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}))

vi.mock('@/db/schema', () => ({
  jobs: {},
  companies: {},
}))

import { db } from '@/db'

const mockJobRows = [
  { id: 1, jobTitle: 'Software Engineer', companyName: 'Acme', isRemote: true, interviewStage: 'not_applied' },
  { id: 2, jobTitle: 'Product Manager', companyName: 'Beta Corp', isRemote: false, interviewStage: 'applied' },
]

function makeSelectChain(result: unknown) {
  const chain: Record<string, unknown> = {}
  const terminal = Promise.resolve(result)
  // make the chain thenable so await works at any depth
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

describe('GET /api/jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>

    let callCount = 0
    mockDb.select.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // count query — resolves immediately after .where()
        const countChain: Record<string, unknown> = {}
        const countResult = Promise.resolve([{ total: 2 }])
        Object.assign(countChain, {
          from: vi.fn(() => countChain),
          leftJoin: vi.fn(() => countChain),
          where: vi.fn(() => countResult),
        })
        return countChain
      }
      // list query — needs orderBy → limit → offset
      return makeSelectChain(mockJobRows)
    })
  })

  it('returns jobs with total, page, and totalPages', async () => {
    const { GET } = await import('@/app/api/jobs/route')
    const req = new NextRequest('http://localhost/api/jobs')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('jobs')
    expect(json).toHaveProperty('total')
    expect(json).toHaveProperty('page')
    expect(json).toHaveProperty('totalPages')
    expect(Array.isArray(json.jobs)).toBe(true)
    expect(json.page).toBe(1)
  })

  it('respects page and limit query params', async () => {
    const { GET } = await import('@/app/api/jobs/route')
    const req = new NextRequest('http://localhost/api/jobs?page=2&limit=10')
    const res = await GET(req)
    const json = await res.json()
    expect(json.page).toBe(2)
  })
})
