import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

vi.mock('@/db', () => ({ db: { execute: vi.fn() } }))

import { db } from '@/db'

function makeRequest(query = '') {
  return new NextRequest(`http://localhost/api/analytics/taxonomy${query}`)
}

function sqlText(query: unknown): string {
  return new PgDialect().sqlToQuery(query as SQL).sql.replace(/\s+/g, ' ')
}

describe('GET /api/analytics/taxonomy', () => {
  const mockDb = db as unknown as { execute: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.clearAllMocks()
    mockDb.execute.mockResolvedValue([])
  })

  it.each([
    ['skills', 'job_skills', 'skills'],
    ['software', 'job_software', 'software'],
    ['certifications', 'job_certifications', 'certifications'],
    ['keywords', 'job_keywords', 'keywords'],
  ])('queries %s through its own junction and catalog', async (category, junction, catalog) => {
    const { GET } = await import('@/app/api/analytics/taxonomy/route')
    const response = await GET(makeRequest(`?category=${category}`))
    expect(response.status).toBe(200)
    const rendered = sqlText(mockDb.execute.mock.calls[0][0])
    expect(rendered).toContain(`"${junction}"`)
    expect(rendered).toContain(`"${catalog}"`)
    expect(rendered).toContain('COUNT(DISTINCT filtered_jobs.id)')
    expect(rendered).toContain('ORDER BY count DESC, name ASC')
    expect(rendered).toContain('is_active IS TRUE')
  })

  it('returns a documented empty result shape', async () => {
    const { GET } = await import('@/app/api/analytics/taxonomy/route')
    const response = await GET(makeRequest('?category=software'))
    expect(await response.json()).toEqual({
      category: 'software',
      percentage_denominator: 'all distinct job-to-value assignments in the group after filters, before limit',
      values: [],
    })
  })

  it('compares clearance groups without changing the legacy skills endpoint', async () => {
    const { GET } = await import('@/app/api/analytics/taxonomy/route')
    const response = await GET(makeRequest('?category=certifications&compare=clearance'))
    expect(response.status).toBe(200)
    expect(mockDb.execute).toHaveBeenCalledTimes(2)
    expect(sqlText(mockDb.execute.mock.calls[0][0])).toContain('security_clearance_req IS TRUE')
    expect(sqlText(mockDb.execute.mock.calls[1][0])).toContain('security_clearance_req IS NOT TRUE')
  })

  it.each([
    ['', 'Invalid category'],
    ['?category=tags', 'Invalid category'],
    ['?category=skills&limit=0', 'Invalid limit'],
    ['?category=skills&compare=platform', 'Invalid compare'],
    ['?category=skills&platform=unknown', 'Invalid platform'],
    ['?category=skills&from=yesterday', 'Invalid date'],
    ['?category=skills&from=2026-02-31', 'Invalid date'],
    ['?category=skills&from=2026-02-02&to=2026-02-01', 'Invalid date range'],
    ['?category=skills&security_clearance=maybe', 'Invalid security_clearance'],
  ])('rejects invalid query %j', async (query, errorPrefix) => {
    const { GET } = await import('@/app/api/analytics/taxonomy/route')
    const response = await GET(makeRequest(query))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toMatch(new RegExp(`^${errorPrefix}`))
    expect(mockDb.execute).not.toHaveBeenCalled()
  })

  it('rejects an ambiguous clearance comparison/filter combination', async () => {
    const { GET } = await import('@/app/api/analytics/taxonomy/route')
    const response = await GET(makeRequest('?category=skills&compare=clearance&security_clearance=true'))
    expect(response.status).toBe(400)
  })

  it('returns 500 when the database query fails', async () => {
    mockDb.execute.mockRejectedValue(new Error('database unavailable'))
    const { GET } = await import('@/app/api/analytics/taxonomy/route')
    const response = await GET(makeRequest('?category=keywords'))
    expect(response.status).toBe(500)
  })
})
