import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'

vi.mock('@/db', () => ({
  db: { execute: vi.fn() },
}))

import { db } from '@/db'

// Render the SQL text of every db.execute call made during the request
const dialect = new PgDialect()
function executedSql() {
  const mockDb = db as unknown as { execute: ReturnType<typeof vi.fn> }
  return mockDb.execute.mock.calls.map(([query]) => dialect.sqlToQuery(query).sql)
}

describe('GET /api/analytics/skills-by-clearance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const mockDb = db as unknown as { execute: ReturnType<typeof vi.fn> }
    mockDb.execute.mockResolvedValue({ rows: [] })
  })

  it('returns 200 with both clearance groups', async () => {
    const { GET } = await import('@/app/api/analytics/skills-by-clearance/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('clearance_required')
    expect(json).toHaveProperty('clearance_not_required')
  })

  it('runs one query per clearance group', async () => {
    const { GET } = await import('@/app/api/analytics/skills-by-clearance/route')
    await GET()
    expect(executedSql()).toHaveLength(2)
  })

  it('excludes soft-deleted jobs in both queries', async () => {
    const { GET } = await import('@/app/api/analytics/skills-by-clearance/route')
    await GET()
    const queries = executedSql()
    for (const q of queries) {
      expect(q).toContain('j.is_active IS TRUE')
    }
  })

  it('treats NULL clearance as not required (IS TRUE / IS NOT TRUE)', async () => {
    const { GET } = await import('@/app/api/analytics/skills-by-clearance/route')
    await GET()
    const [required, notRequired] = executedSql()
    expect(required).toContain('j.security_clearance_req IS TRUE')
    expect(notRequired).toContain('j.security_clearance_req IS NOT TRUE')
  })

  it('returns 500 when the database fails', async () => {
    const mockDb = db as unknown as { execute: ReturnType<typeof vi.fn> }
    mockDb.execute.mockRejectedValue(new Error('db down'))
    const { GET } = await import('@/app/api/analytics/skills-by-clearance/route')
    const res = await GET()
    expect(res.status).toBe(500)
  })
})
