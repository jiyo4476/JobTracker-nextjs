import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

vi.mock('@/lib/resolved-user', () => ({
  resolveRequestUser: vi.fn(),
}))

vi.mock('@/db/session', () => ({
  withUser: vi.fn(),
}))

import { resolveRequestUser } from '@/lib/resolved-user'
import { withUser } from '@/db/session'
import { userJobState } from '@/db/schema'

function renderParams(query: unknown): unknown[] {
  return new PgDialect().sqlToQuery(query as SQL).params
}

function makeReq(id: string, body: unknown, method: string) {
  return new NextRequest(`http://localhost/api/jobs/${id}/state`, {
    method,
    headers: { 'content-type': 'application/json', authorization: 'Bearer test-key' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}
const makeParams = (id: string) => ({ params: Promise.resolve({ id }) })

function resolveAs(userId: number) {
  vi.mocked(resolveRequestUser).mockResolvedValue({
    ok: true,
    user: { id: userId, issuer: 'https://issuer/', subject: `sub-${userId}`, principal: {} as never },
  })
}
function resolveDenied() {
  vi.mocked(resolveRequestUser).mockResolvedValue({
    ok: false,
    response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  })
}

type TxOpts = {
  jobExists?: boolean
  priorStage?: string | null
  returnedRow?: Record<string, unknown>
  deleteRows?: unknown[]
  capture?: {
    stateInsertValues?: (v: Record<string, unknown>) => void
    historyInsertValues?: (v: Record<string, unknown>) => void
    deleteWhere?: (arg: unknown) => void
    stateSelectWhere?: (arg: unknown) => void
  }
}

// Build a mock tx that plays the state route's sequence of reads/writes.
function setupTx(opts: TxOpts = {}) {
  const {
    jobExists = true,
    priorStage = null,
    returnedRow = { userId: 1, jobId: 1, interviewStage: 'applied' },
    deleteRows = [{ jobId: 1 }],
    capture = {},
  } = opts

  vi.mocked(withUser).mockImplementation(async (_id, fn) => {
    // Ordered select results: [job-exists], then [prior-state].
    const selectQueue: unknown[][] = [
      jobExists ? [{ id: 1 }] : [],
      priorStage != null ? [{ interviewStage: priorStage }] : [],
    ]
    const tx = {
      select: vi.fn(() => {
        const result = selectQueue.shift() ?? []
        const chain: Record<string, unknown> = {}
        const p = Promise.resolve(result)
        chain.from = vi.fn(() => chain)
        chain.where = vi.fn((arg: unknown) => { capture.stateSelectWhere?.(arg); return chain })
        chain.limit = vi.fn(() => p)
        return chain
      }),
      insert: vi.fn((table: unknown) => ({
        values: vi.fn((v: Record<string, unknown>) => {
          if (table === userJobState) {
            capture.stateInsertValues?.(v)
            return {
              onConflictDoUpdate: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([returnedRow])) })),
            }
          }
          capture.historyInsertValues?.(v)
          return Promise.resolve([])
        }),
      })),
      delete: vi.fn(() => ({
        where: vi.fn((arg: unknown) => { capture.deleteWhere?.(arg); return { returning: vi.fn(() => Promise.resolve(deleteRows)) } }),
      })),
    }
    return fn(tx as never)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  resolveAs(1)
  setupTx()
})

describe('PUT /api/jobs/[id]/state', () => {
  it('returns 401 when the user cannot be resolved', async () => {
    resolveDenied()
    const { PUT } = await import('@/app/api/jobs/[id]/state/route')
    const res = await PUT(makeReq('1', { has_applied: true }, 'PUT'), makeParams('1'))
    expect(res.status).toBe(401)
  })

  it('returns 400 for a non-numeric id', async () => {
    const { PUT } = await import('@/app/api/jobs/[id]/state/route')
    const res = await PUT(makeReq('abc', { has_applied: true }, 'PUT'), makeParams('abc'))
    expect(res.status).toBe(400)
  })

  it('returns 404 (non-disclosing) when the catalog job does not exist', async () => {
    setupTx({ jobExists: false })
    const { PUT } = await import('@/app/api/jobs/[id]/state/route')
    const res = await PUT(makeReq('999', { has_applied: true }, 'PUT'), makeParams('999'))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Not found' })
  })

  it('upserts the row, sets user_id from the principal (never the body), and marks private', async () => {
    let inserted: Record<string, unknown> | undefined
    setupTx({ capture: { stateInsertValues: (v) => { inserted = v } } })
    const { PUT } = await import('@/app/api/jobs/[id]/state/route')
    const res = await PUT(makeReq('1', { interview_stage: 'applied', priority: 3 }, 'PUT'), makeParams('1'))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(inserted).toMatchObject({ userId: 1, jobId: 1, interviewStage: 'applied', priority: 3 })
  })

  it('appends status history when the stage changes', async () => {
    let history: Record<string, unknown> | undefined
    setupTx({
      priorStage: 'not_applied',
      returnedRow: { userId: 1, jobId: 1, interviewStage: 'phone_screen' },
      capture: { historyInsertValues: (v) => { history = v } },
    })
    const { PUT } = await import('@/app/api/jobs/[id]/state/route')
    const res = await PUT(makeReq('1', { interview_stage: 'phone_screen' }, 'PUT'), makeParams('1'))
    expect(res.status).toBe(200)
    expect(history).toMatchObject({ userId: 1, jobId: 1, fromStage: 'not_applied', toStage: 'phone_screen' })
  })

  it('does NOT append history when the stage is unchanged', async () => {
    let historyCalled = false
    setupTx({
      priorStage: 'applied',
      returnedRow: { userId: 1, jobId: 1, interviewStage: 'applied' },
      capture: { historyInsertValues: () => { historyCalled = true } },
    })
    const { PUT } = await import('@/app/api/jobs/[id]/state/route')
    await PUT(makeReq('1', { notes: 'x' }, 'PUT'), makeParams('1'))
    expect(historyCalled).toBe(false)
  })
})

describe('PATCH /api/jobs/[id]/state — body cannot smuggle ownership', () => {
  it('rejects a body carrying user_id (strict schema)', async () => {
    const { PATCH } = await import('@/app/api/jobs/[id]/state/route')
    const res = await PATCH(makeReq('1', { user_id: 999, has_applied: true }, 'PATCH'), makeParams('1'))
    expect(res.status).toBe(400)
  })

  it('rejects a body carrying job_id (strict schema)', async () => {
    const { PATCH } = await import('@/app/api/jobs/[id]/state/route')
    const res = await PATCH(makeReq('1', { job_id: 2, has_applied: true }, 'PATCH'), makeParams('1'))
    expect(res.status).toBe(400)
  })

  it('rejects an empty PATCH body', async () => {
    const { PATCH } = await import('@/app/api/jobs/[id]/state/route')
    const res = await PATCH(makeReq('1', {}, 'PATCH'), makeParams('1'))
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/jobs/[id]/state', () => {
  it('removes the current user row and returns success (private)', async () => {
    const { DELETE } = await import('@/app/api/jobs/[id]/state/route')
    const res = await DELETE(makeReq('1', undefined, 'DELETE'), makeParams('1'))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(await res.json()).toEqual({ success: true })
  })

  it('returns 404 when nothing was removed (untracked / wrong owner / missing)', async () => {
    setupTx({ deleteRows: [] })
    const { DELETE } = await import('@/app/api/jobs/[id]/state/route')
    const res = await DELETE(makeReq('1', undefined, 'DELETE'), makeParams('1'))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Not found' })
  })
})

describe('two-user adversarial isolation', () => {
  it('user A cannot delete user B state via a direct job id — predicate is scoped to the caller', async () => {
    // Authenticated as user 2. The DELETE predicate must pin user_id = 2, so it can
    // never match user 1's row for the same job id.
    resolveAs(2)
    let deleteWhere: unknown
    setupTx({ deleteRows: [], capture: { deleteWhere: (arg) => { deleteWhere = arg } } })
    const { DELETE } = await import('@/app/api/jobs/[id]/state/route')
    const res = await DELETE(makeReq('55', undefined, 'DELETE'), makeParams('55'))
    // No row for user 2 on job 55 → non-disclosing 404, not user 1's row.
    expect(res.status).toBe(404)
    const params = renderParams(deleteWhere)
    expect(params).toContain(2) // user_id bound to the caller (2), never 1
    expect(params).toContain(55) // job id from the URL
    expect(params).not.toContain(1)
  })

  it('user B upsert writes user_id = B, never a body-supplied owner', async () => {
    resolveAs(2)
    let inserted: Record<string, unknown> | undefined
    setupTx({ capture: { stateInsertValues: (v) => { inserted = v } } })
    const { PUT } = await import('@/app/api/jobs/[id]/state/route')
    // Even with a hostile user_id in the body it is rejected by the schema; here we
    // confirm the legitimate path stamps the caller's id.
    const res = await PUT(makeReq('55', { has_applied: true }, 'PUT'), makeParams('55'))
    expect(res.status).toBe(200)
    expect(inserted).toMatchObject({ userId: 2, jobId: 55 })
  })
})
