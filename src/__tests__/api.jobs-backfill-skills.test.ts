import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({
  requireAuthentication: vi.fn(),
}))

vi.mock('@/lib/nlp-extract', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/nlp-extract')>()
  return {
    ...actual,
    extractTags: vi.fn().mockReturnValue({ skills: ['Python'], software: [], keywords: [], certifications: [] }),
  }
})

vi.mock('@/db', () => ({
  db: { select: vi.fn(), transaction: vi.fn() },
}))

import { requireAuthentication } from '@/lib/auth'
import { db } from '@/db'
import { extractTags } from '@/lib/nlp-extract'
import { skills, jobSkills } from '@/db/schema'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

function makeRequest(query = '') {
  return new NextRequest(`http://localhost/api/jobs/backfill-skills${query}`, {
    method: 'POST',
    headers: { authorization: 'Bearer test-key' },
  })
}

type Candidate = { id: number; jobDescription: string | null }

// Captures the candidates query so tests can assert on the cursor WHERE clause,
// the deterministic ORDER BY, and the applied limit.
function mockCandidates(rows: Candidate[]) {
  const captured: { where?: SQL; limit?: number; ordered?: boolean } = {}
  vi.mocked(db.select).mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockImplementation((condition: SQL) => {
        captured.where = condition
        return {
          orderBy: vi.fn().mockImplementation(() => {
            captured.ordered = true
            return {
              limit: vi.fn().mockImplementation((n: number) => {
                captured.limit = n
                return Promise.resolve(rows)
              }),
            }
          }),
        }
      }),
    }),
  }) as unknown as ReturnType<typeof db.select>)
  return captured
}

// tx whose skill lookup insert echoes each name to an id, and whose junction
// insert reports net-new rows.
function makeTx() {
  const insertCalls: { table: unknown; values: unknown[] }[] = []
  const tx = {
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((vals: Array<Record<string, unknown>>) => {
        insertCalls.push({ table, values: vals })
        const rows = table === skills
          ? vals.map((v, i) => ({ id: i + 1, name: v.name }))
          : vals.map(v => ({ jobId: v.jobId }))
        return {
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue(rows),
          }),
        }
      }),
    })),
    select: vi.fn(() => ({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    })),
  }
  return { tx, insertCalls }
}

function useTx(tx: unknown) {
  vi.mocked(db.transaction).mockImplementation(
    async (cb: (tx: never) => Promise<unknown>) => cb(tx as never),
  )
}

describe('POST /api/jobs/backfill-skills', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(extractTags).mockReturnValue({ skills: ['Python'], software: [], keywords: [], certifications: [] })
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(false)
    const { POST } = await import('@/app/api/jobs/backfill-skills/route')
    const res = await POST(makeRequest())
    expect(res.status).toBe(401)
  })

  it('links extracted skills and reports next_cursor at the last candidate id', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    mockCandidates([{ id: 5, jobDescription: 'Python role.' }])
    const { tx, insertCalls } = makeTx()
    useTx(tx)

    const { POST } = await import('@/app/api/jobs/backfill-skills/route')
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.processed).toBe(1)
    expect(json.candidates).toBe(1)
    expect(json.next_cursor).toBe(5)
    expect(json.done).toBe(true)

    const junctionInsert = insertCalls.find(c => c.table === jobSkills)
    expect(junctionInsert).toBeDefined()
    expect((junctionInsert!.values as Array<{ jobId: number }>).every(v => v.jobId === 5)).toBe(true)
  })

  it('advances the cursor past a zero-skill job so it is not reprocessed forever', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    // This job has a description but extraction yields no skills.
    vi.mocked(extractTags).mockReturnValue({ skills: [], software: [], keywords: [], certifications: [] })
    mockCandidates([{ id: 42, jobDescription: 'A role with no recognizable skills.' }])
    const { tx } = makeTx()
    useTx(tx)

    const { POST } = await import('@/app/api/jobs/backfill-skills/route')
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    // No links written, but the cursor still moves forward — this is the fix.
    expect(json.processed).toBe(0)
    expect(json.skillsLinked).toBe(0)
    expect(json.next_cursor).toBe(42)
    expect(vi.mocked(db.transaction)).not.toHaveBeenCalled()
  })

  it('applies a deterministic cursor + order + limit to the candidate query', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    const captured = mockCandidates([])
    const { tx } = makeTx()
    useTx(tx)

    const { POST } = await import('@/app/api/jobs/backfill-skills/route')
    const res = await POST(makeRequest('?cursor=50&limit=10'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({
      processed: 0,
      skillsLinked: 0,
      candidates: 0,
      next_cursor: 50,
      done: true,
    })

    expect(captured.ordered).toBe(true)
    expect(captured.limit).toBe(10)
    const { sql: rendered, params } = new PgDialect().sqlToQuery(captured.where!)
    expect(rendered).toMatch(/"jobs"\."id"\s*>\s*\$\d+/)
    expect(params).toContain(50)
  })
})
