import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

// API-013 slice 3 — the contacts routes now resolve an interactive user and run every
// query owner-scoped inside withUser against user_job_contacts. Mock only the auth
// resolution and the transaction wrapper; use REAL drizzle + schema so the owner
// predicate can be rendered to SQL and asserted (mirrors api.jobs-state.test.ts).

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

function makeReq(url: string, body?: unknown, method = 'POST') {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json', authorization: 'Bearer test-key' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

function makeParams(id: string): { params: Promise<{ id: string }> }
function makeParams(id: string, contactId: string): { params: Promise<{ id: string; contactId: string }> }
function makeParams(id: string, contactId?: string) {
  return { params: Promise.resolve(contactId ? { id, contactId } : { id }) }
}

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

type Capture = {
  selectWhere?: (arg: unknown) => void
  stateInsertValues?: (v: Record<string, unknown>) => void
  contactInsertValues?: (v: Record<string, unknown>) => void
  updateWhere?: (arg: unknown) => void
  deleteWhere?: (arg: unknown) => void
}

type TxOpts = {
  jobExists?: boolean
  contactRows?: unknown[]
  insertedContact?: Record<string, unknown>
  updateRows?: unknown[]
  deleteRows?: unknown[]
  capture?: Capture
}

function setupTx(opts: TxOpts = {}) {
  const {
    jobExists = true,
    contactRows = [{ id: 10, name: 'Jane Doe', email: 'jane@example.com' }],
    insertedContact = { id: 10, userId: 1, jobId: 1, name: 'Jane Doe' },
    updateRows = [{ id: 10 }],
    deleteRows = [{ id: 10 }],
    capture = {},
  } = opts

  vi.mocked(withUser).mockImplementation(async (_id, fn) => {
    const tx = {
      select: vi.fn(() => {
        const chain: Record<string, unknown> = {}
        chain.from = vi.fn(() => chain)
        chain.where = vi.fn((arg: unknown) => { capture.selectWhere?.(arg); return chain })
        // existence check (POST) terminates on .limit(); GET list terminates on .orderBy().
        chain.limit = vi.fn(() => Promise.resolve(jobExists ? [{ id: 1 }] : []))
        chain.orderBy = vi.fn(() => Promise.resolve(contactRows))
        return chain
      }),
      insert: vi.fn((table: unknown) => ({
        values: vi.fn((v: Record<string, unknown>) => {
          if (table === userJobState) {
            capture.stateInsertValues?.(v)
            return { onConflictDoNothing: vi.fn(() => Promise.resolve([])) }
          }
          capture.contactInsertValues?.(v)
          return { returning: vi.fn(() => Promise.resolve([insertedContact])) }
        }),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn((arg: unknown) => { capture.updateWhere?.(arg); return { returning: vi.fn(() => Promise.resolve(updateRows)) } }),
        })),
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

describe('GET /api/jobs/[id]/contacts', () => {
  it('returns 401 when the user cannot be resolved (contacts carry PII)', async () => {
    resolveDenied()
    const { GET } = await import('@/app/api/jobs/[id]/contacts/route')
    const res = await GET(makeReq('http://localhost/api/jobs/1/contacts', undefined, 'GET'), makeParams('1'))
    expect(res.status).toBe(401)
  })

  it('returns 400 for a non-numeric id', async () => {
    const { GET } = await import('@/app/api/jobs/[id]/contacts/route')
    const res = await GET(makeReq('http://localhost/api/jobs/abc/contacts', undefined, 'GET'), makeParams('abc'))
    expect(res.status).toBe(400)
  })

  it('returns the caller-scoped contacts list, private/no-store', async () => {
    let where: unknown
    setupTx({ capture: { selectWhere: (arg) => { where = arg } } })
    const { GET } = await import('@/app/api/jobs/[id]/contacts/route')
    const res = await GET(makeReq('http://localhost/api/jobs/1/contacts', undefined, 'GET'), makeParams('1'))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    const json = await res.json()
    expect(Array.isArray(json)).toBe(true)
    expect(json[0]).toHaveProperty('name', 'Jane Doe')
    // Predicate is pinned to the caller (1) and the job id (1).
    const params = renderParams(where)
    expect(params).toContain(1)
  })
})

describe('POST /api/jobs/[id]/contacts', () => {
  it('returns 401 without a resolved user', async () => {
    resolveDenied()
    const { POST } = await import('@/app/api/jobs/[id]/contacts/route')
    const res = await POST(makeReq('http://localhost/api/jobs/1/contacts', { name: 'Jane' }), makeParams('1'))
    expect(res.status).toBe(401)
  })

  it('returns 400 for an invalid body', async () => {
    const { POST } = await import('@/app/api/jobs/[id]/contacts/route')
    const res = await POST(makeReq('http://localhost/api/jobs/1/contacts', { email: 'not-an-email' }), makeParams('1'))
    expect(res.status).toBe(400)
  })

  it('returns a non-disclosing 404 when the catalog job does not exist', async () => {
    setupTx({ jobExists: false })
    const { POST } = await import('@/app/api/jobs/[id]/contacts/route')
    const res = await POST(makeReq('http://localhost/api/jobs/999/contacts', { name: 'Jane' }), makeParams('999'))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Not found' })
  })

  it('transactionally materializes a default state row and stamps user_id from the caller', async () => {
    let stateValues: Record<string, unknown> | undefined
    let contactValues: Record<string, unknown> | undefined
    setupTx({
      capture: {
        stateInsertValues: (v) => { stateValues = v },
        contactInsertValues: (v) => { contactValues = v },
      },
    })
    const { POST } = await import('@/app/api/jobs/[id]/contacts/route')
    const res = await POST(
      makeReq('http://localhost/api/jobs/1/contacts', { name: 'Jane Doe', email: 'jane@example.com' }),
      makeParams('1'),
    )
    expect(res.status).toBe(201)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    // The default state row is created for (caller, job) so the contact FK is satisfiable.
    expect(stateValues).toEqual({ userId: 1, jobId: 1 })
    // The contact owner is the caller, never a body-supplied value.
    expect(contactValues).toMatchObject({ userId: 1, jobId: 1, name: 'Jane Doe', email: 'jane@example.com' })
  })

  it('rejects a body that tries to smuggle user_id / job_id (strict schema)', async () => {
    const { POST } = await import('@/app/api/jobs/[id]/contacts/route')
    const res = await POST(
      makeReq('http://localhost/api/jobs/1/contacts', { name: 'Jane', user_id: 999 }),
      makeParams('1'),
    )
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/jobs/[id]/contacts/[contactId]', () => {
  it('returns 401 without a resolved user', async () => {
    resolveDenied()
    const { PATCH } = await import('@/app/api/jobs/[id]/contacts/[contactId]/route')
    const res = await PATCH(makeReq('http://localhost/api/jobs/1/contacts/1', { name: 'Jane' }, 'PATCH'), makeParams('1', '1'))
    expect(res.status).toBe(401)
  })

  it('returns 400 for an empty body', async () => {
    const { PATCH } = await import('@/app/api/jobs/[id]/contacts/[contactId]/route')
    const res = await PATCH(makeReq('http://localhost/api/jobs/1/contacts/1', {}, 'PATCH'), makeParams('1', '1'))
    expect(res.status).toBe(400)
  })

  it('returns a non-disclosing 404 when nothing matches the owner predicate', async () => {
    setupTx({ updateRows: [] })
    const { PATCH } = await import('@/app/api/jobs/[id]/contacts/[contactId]/route')
    const res = await PATCH(makeReq('http://localhost/api/jobs/1/contacts/999', { name: 'Jane' }, 'PATCH'), makeParams('1', '999'))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Not found' })
  })

  it('updates with an owner-scoped predicate and returns success (private)', async () => {
    let where: unknown
    setupTx({ capture: { updateWhere: (arg) => { where = arg } } })
    const { PATCH } = await import('@/app/api/jobs/[id]/contacts/[contactId]/route')
    const res = await PATCH(makeReq('http://localhost/api/jobs/1/contacts/10', { name: 'Jane Updated' }, 'PATCH'), makeParams('1', '10'))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(await res.json()).toEqual({ success: true })
    // Predicate carries contact id (10), caller user_id (1), and job id (1).
    const params = renderParams(where)
    expect(params).toEqual(expect.arrayContaining([10, 1]))
  })
})

describe('DELETE /api/jobs/[id]/contacts/[contactId]', () => {
  it('returns 401 without a resolved user', async () => {
    resolveDenied()
    const { DELETE } = await import('@/app/api/jobs/[id]/contacts/[contactId]/route')
    const res = await DELETE(makeReq('http://localhost/api/jobs/1/contacts/1', undefined, 'DELETE'), makeParams('1', '1'))
    expect(res.status).toBe(401)
  })

  it('returns a non-disclosing 404 when nothing matches', async () => {
    setupTx({ deleteRows: [] })
    const { DELETE } = await import('@/app/api/jobs/[id]/contacts/[contactId]/route')
    const res = await DELETE(makeReq('http://localhost/api/jobs/1/contacts/999', undefined, 'DELETE'), makeParams('1', '999'))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Not found' })
  })

  it('deletes with an owner-scoped predicate and returns success (private)', async () => {
    const { DELETE } = await import('@/app/api/jobs/[id]/contacts/[contactId]/route')
    const res = await DELETE(makeReq('http://localhost/api/jobs/1/contacts/10', undefined, 'DELETE'), makeParams('1', '10'))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(await res.json()).toEqual({ success: true })
  })
})

describe('two-user adversarial isolation', () => {
  it('user B cannot PATCH user A contact on the same job — predicate pins the caller', async () => {
    // Authenticated as user 2, targeting job 55 / contact 77 that belong to user 1.
    resolveAs(2)
    let updateWhere: unknown
    setupTx({ updateRows: [], capture: { updateWhere: (arg) => { updateWhere = arg } } })
    const { PATCH } = await import('@/app/api/jobs/[id]/contacts/[contactId]/route')
    const res = await PATCH(makeReq('http://localhost/api/jobs/55/contacts/77', { name: 'hijack' }, 'PATCH'), makeParams('55', '77'))
    // No row matches (user_id = 2) → non-disclosing 404, never user 1's contact.
    expect(res.status).toBe(404)
    const params = renderParams(updateWhere)
    expect(params).toContain(77) // contact id from URL
    expect(params).toContain(2)  // user_id bound to the CALLER (2)
    expect(params).toContain(55) // job id from URL
    expect(params).not.toContain(1) // never user A
  })

  it('user B cannot DELETE user A contact on the same job — predicate pins the caller', async () => {
    resolveAs(2)
    let deleteWhere: unknown
    setupTx({ deleteRows: [], capture: { deleteWhere: (arg) => { deleteWhere = arg } } })
    const { DELETE } = await import('@/app/api/jobs/[id]/contacts/[contactId]/route')
    const res = await DELETE(makeReq('http://localhost/api/jobs/55/contacts/77', undefined, 'DELETE'), makeParams('55', '77'))
    expect(res.status).toBe(404)
    const params = renderParams(deleteWhere)
    expect(params).toContain(77)
    expect(params).toContain(2)
    expect(params).toContain(55)
    expect(params).not.toContain(1)
  })

  it('user B GET reads only its own contacts on a shared job — predicate pins the caller', async () => {
    resolveAs(2)
    let selectWhere: unknown
    setupTx({ contactRows: [], capture: { selectWhere: (arg) => { selectWhere = arg } } })
    const { GET } = await import('@/app/api/jobs/[id]/contacts/route')
    const res = await GET(makeReq('http://localhost/api/jobs/55/contacts', undefined, 'GET'), makeParams('55'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
    const params = renderParams(selectWhere)
    expect(params).toContain(2)  // caller
    expect(params).toContain(55) // job
    expect(params).not.toContain(1)
  })
})
