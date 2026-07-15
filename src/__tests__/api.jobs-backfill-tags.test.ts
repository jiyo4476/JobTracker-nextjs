import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({
  requireApiKey: vi.fn(),
}))

vi.mock('@/lib/nlp-extract', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/nlp-extract')>()
  return {
    ...actual,
    extractTags: vi.fn().mockReturnValue({
      skills: ['Python'],
      software: ['Docker'],
      keywords: ['remote'],
      certifications: ['CISSP'],
    }),
  }
})

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    transaction: vi.fn(),
  },
}))

import { requireApiKey } from '@/lib/auth'
import { db } from '@/db'
import { extractTags } from '@/lib/nlp-extract'
import {
  skills, software as softwareTable, certifications,
  jobSkills, jobSoftware, jobCertifications,
} from '@/db/schema'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

function makeRequest(query = '') {
  return new NextRequest(`http://localhost/api/jobs/backfill-tags${query}`, {
    method: 'POST',
    headers: { authorization: 'Bearer test-key' },
  })
}

type Candidate = { id: number; jobDescription: string | null }

// Captures the candidates query so tests can assert on the cursor WHERE clause
// and the applied limit.
function mockCandidates(rows: Candidate[]) {
  const captured: { where?: SQL; limit?: number } = {}
  vi.mocked(db.select).mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockImplementation((condition: SQL) => {
        captured.where = condition
        return {
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation((n: number) => {
              captured.limit = n
              return Promise.resolve(rows)
            }),
          }),
        }
      }),
    }),
  }) as unknown as ReturnType<typeof db.select>)
  return captured
}

// A tx mock whose lookup inserts resolve every name to an id, and whose
// junction inserts either echo the rows (net-new links) or return [] (all
// links already existed). junctionRows can vary per junction table to model
// partially-backfilled jobs.
function makeTx(junctionRows: (table: unknown) => 'echo' | 'none' = () => 'echo') {
  const insertCalls: { table: unknown; values: unknown[] }[] = []
  const lookupTables = new Set<unknown>([skills, softwareTable, certifications])

  const tx = {
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((vals: Array<Record<string, unknown>>) => {
        insertCalls.push({ table, values: vals })
        const result = lookupTables.has(table)
          ? vals.map((v, i) => ({ id: i + 1, name: v.name }))
          : junctionRows(table) === 'echo'
            ? vals.map(v => ({ jobId: v.jobId }))
            : []
        return {
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue(result),
          }),
        }
      }),
    })),
    select: vi.fn(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    })),
  }
  return { tx, insertCalls }
}

function useTx(tx: unknown) {
  vi.mocked(db.transaction).mockImplementation(
    async (cb: (tx: never) => Promise<unknown>) => cb(tx as never),
  )
}

describe('POST /api/jobs/backfill-tags', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(extractTags).mockReturnValue({
      skills: ['Python'],
      software: ['Docker'],
      keywords: ['remote'],
      certifications: ['CISSP'],
    })
  })

  it('returns 401 when requireApiKey returns false', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(false)
    const { POST } = await import('@/app/api/jobs/backfill-tags/route')
    const res = await POST(makeRequest())
    expect(res.status).toBe(401)
  })

  it('attaches all three categories and reports per-category counts', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    mockCandidates([{ id: 5, jobDescription: 'Python, Docker, CISSP.' }])
    const { tx, insertCalls } = makeTx()
    useTx(tx)

    const { POST } = await import('@/app/api/jobs/backfill-tags/route')
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({
      processed: 1,
      candidates: 1,
      linked: { skills: 1, software: 1, certifications: 1 },
      next_cursor: 5,
      done: true,
    })

    // Independent junction inserts against each taxonomy's own table
    const junctionInserts = insertCalls.filter(c =>
      c.table === jobSkills || c.table === jobSoftware || c.table === jobCertifications)
    expect(junctionInserts.map(c => c.table)).toEqual(
      expect.arrayContaining([jobSkills, jobSoftware, jobCertifications]))
    expect(junctionInserts.every(c =>
      (c.values as Array<{ jobId: number }>).every(v => v.jobId === 5))).toBe(true)
  })

  it('is idempotent — a second run over already-linked jobs reports zero new links', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    mockCandidates([{ id: 5, jobDescription: 'Python, Docker, CISSP.' }])
    const { tx } = makeTx(() => 'none') // every junction row already exists
    useTx(tx)

    const { POST } = await import('@/app/api/jobs/backfill-tags/route')
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.processed).toBe(1)
    expect(json.linked).toEqual({ skills: 0, software: 0, certifications: 0 })
  })

  it('fills in missing categories on a job with partial existing links', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    mockCandidates([{ id: 5, jobDescription: 'Python, Docker, CISSP.' }])
    // Skills were already linked by the legacy backfill; software/certs are new
    const { tx } = makeTx(table => (table === jobSkills ? 'none' : 'echo'))
    useTx(tx)

    const { POST } = await import('@/app/api/jobs/backfill-tags/route')
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.linked).toEqual({ skills: 0, software: 1, certifications: 1 })
  })

  it('returns 500 with a resumable cursor when a job transaction fails', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    mockCandidates([
      { id: 5, jobDescription: 'Python.' },
      { id: 9, jobDescription: 'Docker.' },
    ])
    const { tx } = makeTx()
    vi.mocked(db.transaction)
      .mockImplementationOnce(async (cb: (tx: never) => Promise<unknown>) => cb(tx as never))
      .mockRejectedValueOnce(new Error('deadlock detected'))

    const { POST } = await import('@/app/api/jobs/backfill-tags/route')
    const res = await POST(makeRequest())
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.failed_job_id).toBe(9)
    expect(json.processed).toBe(1)
    expect(json.linked).toEqual({ skills: 1, software: 1, certifications: 1 })
    // Resuming from next_cursor retries the failed job
    expect(json.next_cursor).toBe(5)
    expect(json.done).toBe(false)
  })

  it('bounds the batch by cursor and limit', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const captured = mockCandidates([])
    const { tx } = makeTx()
    useTx(tx)

    const { POST } = await import('@/app/api/jobs/backfill-tags/route')
    const res = await POST(makeRequest('?cursor=50&limit=10'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({
      processed: 0,
      candidates: 0,
      linked: { skills: 0, software: 0, certifications: 0 },
      next_cursor: 50,
      done: true,
    })

    expect(captured.limit).toBe(10)
    const { sql: rendered, params } = new PgDialect().sqlToQuery(captured.where!)
    expect(rendered).toMatch(/"jobs"\."id"\s*>\s*\$\d+/)
    expect(params).toContain(50)
  })

  it('reports extraction samples without writing anything on dry_run', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    mockCandidates([{ id: 5, jobDescription: 'Python, Docker, CISSP.' }])

    const { POST } = await import('@/app/api/jobs/backfill-tags/route')
    const res = await POST(makeRequest('?dry_run=1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.dry_run).toBe(true)
    expect(json.candidates).toBe(1)
    expect(json.extracted).toEqual({ skills: 1, software: 1, certifications: 1 })
    expect(json.sample).toEqual([
      { job_id: 5, skills: ['Python'], software: ['Docker'], certifications: ['CISSP'] },
    ])
    expect(vi.mocked(db.transaction)).not.toHaveBeenCalled()
  })
})
