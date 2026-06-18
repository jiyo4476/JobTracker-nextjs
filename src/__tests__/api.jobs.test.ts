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

describe('GET /api/jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>

    let selectCallCount = 0
    mockDb.select.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            // For count query
            then: undefined,
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(mockJobRows),
            }),
            // Count query returns total
            [Symbol.iterator]: undefined,
          }),
          limit: vi.fn().mockReturnValue({
            offset: vi.fn().mockResolvedValue(mockJobRows),
          }),
        }),
      }),
    }))

    // Override to handle count vs list differently
    selectCallCount = 0
    mockDb.select.mockImplementation(() => {
      selectCallCount++
      if (selectCallCount === 1) {
        // count query
        return {
          from: vi.fn().mockReturnValue({
            leftJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ total: 2 }]),
            }),
          }),
        }
      }
      // list query
      return {
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  offset: vi.fn().mockResolvedValue(mockJobRows),
                }),
              }),
            }),
          }),
        }),
      }
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
