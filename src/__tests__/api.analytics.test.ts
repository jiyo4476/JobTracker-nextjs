import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/db', () => ({
  db: { execute: vi.fn() },
}))

vi.mock('@/db/schema', () => ({
  jobs: {},
}))

import { db } from '@/db'

function makeRequest(qs = '') {
  return new NextRequest(`http://localhost/api/analytics${qs}`)
}

describe('GET /api/analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.execute.mockResolvedValue({ rows: [] })
  })

  it('returns 200 with all expected shape keys', async () => {
    const { GET } = await import('@/app/api/analytics/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('skillDemandOverTime')
    expect(json).toHaveProperty('salaryDistribution')
    expect(json).toHaveProperty('platformBreakdown')
    expect(json).toHaveProperty('remoteVsOnsiteByWeek')
  })

  it('calls db.execute 4 times (one per parallel query)', async () => {
    const { GET } = await import('@/app/api/analytics/route')
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    await GET(makeRequest())
    expect(mockDb.execute).toHaveBeenCalledTimes(4)
  })

  it('returns 200 with from/to/platform query params', async () => {
    const { GET } = await import('@/app/api/analytics/route')
    const res = await GET(makeRequest('?from=2024-01-01&to=2024-12-31&platform=linkedin'))
    expect(res.status).toBe(200)
  })

  it('returns 200 with security clearance skill chart query params', async () => {
    const { GET } = await import('@/app/api/analytics/route')
    const res = await GET(makeRequest('?security_clearance=true'))
    expect(res.status).toBe(200)
  })

  it('ignores invalid platform param', async () => {
    const { GET } = await import('@/app/api/analytics/route')
    const res = await GET(makeRequest('?platform=notaplatform'))
    expect(res.status).toBe(200)
  })

  it('ignores malformed date params', async () => {
    const { GET } = await import('@/app/api/analytics/route')
    const res = await GET(makeRequest('?from=not-a-date&to=also-bad'))
    expect(res.status).toBe(200)
  })
})
