import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db', () => ({
  db: { execute: vi.fn() },
}))

import { db } from '@/db'

// Flattens a drizzle sql`` template object (nested SQL chunks + string chunks)
// into plain text so tests can assert on the generated SQL.
function sqlText(chunk: unknown): string {
  if (chunk == null) return ''
  if (typeof chunk === 'object') {
    if ('queryChunks' in chunk) {
      return (chunk as { queryChunks: unknown[] }).queryChunks.map(sqlText).join('')
    }
    if ('value' in chunk) {
      const v = (chunk as { value: unknown }).value
      return Array.isArray(v) ? v.join('') : String(v)
    }
  }
  return String(chunk)
}

describe('GET /api/analytics/skills-by-clearance', () => {
  const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>

  beforeEach(() => {
    vi.clearAllMocks()
    mockDb.execute.mockResolvedValue([])
  })

  it('returns 200 with clearance_required and clearance_not_required keys', async () => {
    const { GET } = await import('@/app/api/analytics/skills-by-clearance/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('clearance_required')
    expect(json).toHaveProperty('clearance_not_required')
  })

  it('calls db.execute 2 times (one per clearance group)', async () => {
    const { GET } = await import('@/app/api/analytics/skills-by-clearance/route')
    await GET()
    expect(mockDb.execute).toHaveBeenCalledTimes(2)
  })

  it('returns empty arrays when no jobs match either group', async () => {
    const { GET } = await import('@/app/api/analytics/skills-by-clearance/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.clearance_required).toEqual([])
    expect(json.clearance_not_required).toEqual([])
  })

  it('maps the first query to clearance_required and the second to clearance_not_required', async () => {
    const requiredRows = [
      { skill: 'Python', count: 156, percentage: 8.5 },
      { skill: 'AWS', count: 120, percentage: 6.5 },
    ]
    const notRequiredRows = [{ skill: 'Python', count: 324, percentage: 12.1 }]
    mockDb.execute
      .mockResolvedValueOnce(requiredRows)
      .mockResolvedValueOnce(notRequiredRows)

    const { GET } = await import('@/app/api/analytics/skills-by-clearance/route')
    const res = await GET()
    const json = await res.json()
    expect(json.clearance_required).toEqual(requiredRows)
    expect(json.clearance_not_required).toEqual(notRequiredRows)
  })

  it('filters clearance in SQL, treating NULL security_clearance_req as not required', async () => {
    // security_clearance_req defaults to false but is nullable, so the
    // not-required group must use IS NOT TRUE (false OR NULL), not = false.
    const { GET } = await import('@/app/api/analytics/skills-by-clearance/route')
    await GET()
    const [firstQuery] = mockDb.execute.mock.calls[0]
    const [secondQuery] = mockDb.execute.mock.calls[1]
    expect(sqlText(firstQuery)).toContain('security_clearance_req IS TRUE')
    expect(sqlText(secondQuery)).toContain('security_clearance_req IS NOT TRUE')
  })

  it('limits each list to the top 15 skills sorted by count desc, in SQL', async () => {
    const { GET } = await import('@/app/api/analytics/skills-by-clearance/route')
    await GET()
    for (const call of mockDb.execute.mock.calls) {
      const text = sqlText(call[0])
      expect(text).toContain('LIMIT 15')
      expect(text).toContain('ORDER BY cnt DESC')
    }
  })

  it("computes percentage over the group's total skill occurrences, before the LIMIT", async () => {
    const { GET } = await import('@/app/api/analytics/skills-by-clearance/route')
    await GET()
    for (const call of mockDb.execute.mock.calls) {
      const text = sqlText(call[0])
      // Window aggregate over the whole skill_counts CTE (all skills in the
      // group), rounded to 1 decimal — LIMIT 15 only trims the final output.
      expect(text).toContain('SUM(cnt) OVER ()')
      expect(text).toContain('ROUND(cnt * 100.0 / SUM(cnt) OVER (), 1)')
    }
  })

  it('returns 500 when the database query fails', async () => {
    mockDb.execute.mockRejectedValue(new Error('connection refused'))
    const { GET } = await import('@/app/api/analytics/skills-by-clearance/route')
    const res = await GET()
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json).toEqual({ error: 'Internal server error' })
  })
})
