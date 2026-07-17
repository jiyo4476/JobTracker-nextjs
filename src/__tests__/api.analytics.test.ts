import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { PgDialect } from 'drizzle-orm/pg-core'

vi.mock('@/db', () => ({
  db: { execute: vi.fn() },
}))

import { db } from '@/db'

function makeRequest(qs = '') {
  return new NextRequest(`http://localhost/api/analytics${qs}`)
}

// Render the SQL text of every db.execute call made during the request
const dialect = new PgDialect()
function executedSql() {
  const mockDb = db as unknown as { execute: ReturnType<typeof vi.fn> }
  return mockDb.execute.mock.calls.map(([query]) => dialect.sqlToQuery(query).sql)
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

  it('returns 200 with the global security clearance query param', async () => {
    const { GET } = await import('@/app/api/analytics/route')
    const res = await GET(makeRequest('?security_clearance=true'))
    expect(res.status).toBe(200)
  })

  it('excludes soft-deleted jobs in every query', async () => {
    const { GET } = await import('@/app/api/analytics/route')
    await GET(makeRequest())
    const queries = executedSql()
    expect(queries).toHaveLength(4)
    for (const q of queries) {
      expect(q).toContain('is_active IS TRUE')
    }
  })

  it('security_clearance=true filters every analytics query with IS TRUE', async () => {
    const { GET } = await import('@/app/api/analytics/route')
    await GET(makeRequest('?security_clearance=true'))
    for (const query of executedSql()) {
      expect(query).toContain('security_clearance_req IS TRUE')
    }
  })

  it('security_clearance=false treats NULL clearance as not required in every query', async () => {
    const { GET } = await import('@/app/api/analytics/route')
    await GET(makeRequest('?security_clearance=false'))
    for (const query of executedSql()) {
      expect(query).toContain('security_clearance_req IS NOT TRUE')
    }
  })

  it('omits the clearance filter when the param is absent', async () => {
    const { GET } = await import('@/app/api/analytics/route')
    await GET(makeRequest())
    for (const query of executedSql()) {
      expect(query).not.toContain('security_clearance_req')
    }
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
