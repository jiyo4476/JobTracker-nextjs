import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { expectJsonError } from './helpers/json-error'

vi.mock('@/lib/auth', () => ({
  requireAuthentication: vi.fn(),
}))

vi.mock('@/lib/resolved-user', () => ({
  resolveRequestUser: vi.fn(),
}))

vi.mock('@/db/session', () => ({
  withUser: vi.fn((_userId: number, callback: (tx: unknown) => unknown) => callback(db)),
}))

vi.mock('@/db', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
}))

vi.mock('@/db/schema', () => ({
  resumeVersions: {},
}))

import { requireAuthentication } from '@/lib/auth'
import { resolveRequestUser } from '@/lib/resolved-user'
import { db } from '@/db'
import { authedGet } from './helpers/authed-request'

let lastWhere: unknown
function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {}
  const terminal = Promise.resolve(result)
  const methods = ['from', 'where', 'orderBy', 'limit', 'values', 'returning', 'set']
  methods.forEach(m => { chain[m] = vi.fn(() => chain) })
  chain.where = vi.fn((value: unknown) => { lastWhere = value; return chain })
  chain.then = terminal.then.bind(terminal)
  chain.catch = terminal.catch.bind(terminal)
  return chain
}

const mockVersion = { id: 1, label: 'v1', date: '2024-01-01', notes: 'Initial', createdAt: new Date() }

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

const renderParams = (query: unknown) => new PgDialect().sqlToQuery(query as SQL).params

function setAuth(authenticated: boolean, userId = 2) {
  vi.mocked(requireAuthentication).mockResolvedValue(authenticated)
  vi.mocked(resolveRequestUser).mockResolvedValue(authenticated
    ? { ok: true, user: { id: userId } as never }
    : { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) })
}

function makeReq(url: string, body?: unknown, auth = true, method = 'POST') {
  return new NextRequest(url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(auth ? { authorization: 'Bearer test-key' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe('GET /api/resume-versions', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 without auth', async () => {
    setAuth(false)
    const { GET } = await import('@/app/api/resume-versions/route')
    const res = await GET(makeReq('http://localhost/api/resume-versions', undefined, false, 'GET'))
    expect(res.status).toBe(401)
  })

  it('returns list of resume versions', async () => {
    setAuth(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.select.mockReturnValue(makeChain([mockVersion]))

    const { GET } = await import('@/app/api/resume-versions/route')
    const res = await GET(authedGet('http://localhost/api/resume-versions'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json)).toBe(true)
    expect(json[0]).toHaveProperty('label', 'v1')
  })
})

describe('POST /api/resume-versions', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 without auth', async () => {
    setAuth(false)
    const { POST } = await import('@/app/api/resume-versions/route')
    const res = await POST(makeReq('http://localhost/api/resume-versions', { label: 'v1' }, false))
    expect(res.status).toBe(401)
  })

  it('returns 400 for missing label', async () => {
    setAuth(true)
    const { POST } = await import('@/app/api/resume-versions/route')
    const res = await POST(makeReq('http://localhost/api/resume-versions', { notes: 'no label' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid date format', async () => {
    setAuth(true)
    const { POST } = await import('@/app/api/resume-versions/route')
    const res = await POST(makeReq('http://localhost/api/resume-versions', { label: 'v1', date: 'not-a-date' }))
    expect(res.status).toBe(400)
  })

  it('returns 201 on success', async () => {
    setAuth(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.insert.mockReturnValue(makeChain([mockVersion]))

    const { POST } = await import('@/app/api/resume-versions/route')
    const res = await POST(makeReq('http://localhost/api/resume-versions', { label: 'v1', date: '2024-01-01' }))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json).toHaveProperty('label', 'v1')
  })
})

describe('PATCH /api/resume-versions/[id]', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 without auth', async () => {
    setAuth(false)
    const { PATCH } = await import('@/app/api/resume-versions/[id]/route')
    const res = await PATCH(makeReq('http://localhost/api/resume-versions/1', { label: 'v2' }, false, 'PATCH'), makeParams('1'))
    expect(res.status).toBe(401)
  })

  it('returns 400 for non-numeric id', async () => {
    setAuth(true)
    const { PATCH } = await import('@/app/api/resume-versions/[id]/route')
    const res = await PATCH(makeReq('http://localhost/api/resume-versions/abc', { label: 'v2' }, true, 'PATCH'), makeParams('abc'))
    expect(res.status).toBe(400)
  })

  it('returns 400 for extra unknown fields (strict)', async () => {
    setAuth(true)
    const { PATCH } = await import('@/app/api/resume-versions/[id]/route')
    const res = await PATCH(makeReq('http://localhost/api/resume-versions/1', { label: 'v2', unknown_field: true }, true, 'PATCH'), makeParams('1'))
    expect(res.status).toBe(400)
  })

  it('returns 200 with the updated row on success', async () => {
    setAuth(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.update.mockReturnValue(makeChain([{ ...mockVersion, label: 'v2' }]))

    const { PATCH } = await import('@/app/api/resume-versions/[id]/route')
    const res = await PATCH(makeReq('http://localhost/api/resume-versions/1', { label: 'v2' }, true, 'PATCH'), makeParams('1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('id', 1)
    expect(json).toHaveProperty('label', 'v2')
  })

  it('returns 404 when id not found', async () => {
    setAuth(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.update.mockReturnValue(makeChain([]))

    const { PATCH } = await import('@/app/api/resume-versions/[id]/route')
    const res = await PATCH(makeReq('http://localhost/api/resume-versions/999', { label: 'v2' }, true, 'PATCH'), makeParams('999'))
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/resume-versions/[id]', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 without auth', async () => {
    setAuth(false)
    const { DELETE } = await import('@/app/api/resume-versions/[id]/route')
    const req = new NextRequest('http://localhost/api/resume-versions/1', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('1'))
    expect(res.status).toBe(401)
  })

  it('returns 400 for non-numeric id', async () => {
    setAuth(true)
    const { DELETE } = await import('@/app/api/resume-versions/[id]/route')
    const req = new NextRequest('http://localhost/api/resume-versions/abc', {
      method: 'DELETE',
      headers: { authorization: 'Bearer test-key' },
    })
    const res = await DELETE(req, makeParams('abc'))
    expect(res.status).toBe(400)
  })

  it('returns 404 when not found', async () => {
    setAuth(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.delete.mockReturnValue(makeChain([]))

    const { DELETE } = await import('@/app/api/resume-versions/[id]/route')
    const req = new NextRequest('http://localhost/api/resume-versions/999', {
      method: 'DELETE',
      headers: { authorization: 'Bearer test-key' },
    })
    const res = await DELETE(req, makeParams('999'))
    expect(res.status).toBe(404)
  })

  it('returns 200 on success', async () => {
    setAuth(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.delete.mockReturnValue(makeChain([mockVersion]))

    const { DELETE } = await import('@/app/api/resume-versions/[id]/route')
    const req = new NextRequest('http://localhost/api/resume-versions/1', {
      method: 'DELETE',
      headers: { authorization: 'Bearer test-key' },
    })
    const res = await DELETE(req, makeParams('1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('success', true)
  })
})

// A forced DB fault must surface as the standard JSON { error } 500 envelope,
// never the framework's default HTML 500. (TECHDEBT-004)
describe('resume-versions error envelope on DB failure', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('GET returns JSON error, not HTML, when the query throws', async () => {
    setAuth(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.select.mockImplementation(() => { throw new Error('db down') })

    const { GET } = await import('@/app/api/resume-versions/route')
    await expectJsonError(await GET(authedGet('http://localhost/api/resume-versions')))
  })

  it('PATCH returns JSON error, not HTML, when the update throws', async () => {
    setAuth(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.update.mockImplementation(() => { throw new Error('db down') })

    const { PATCH } = await import('@/app/api/resume-versions/[id]/route')
    await expectJsonError(await PATCH(
      makeReq('http://localhost/api/resume-versions/1', { label: 'v2' }, true, 'PATCH'),
      makeParams('1'),
    ))
  })

  it('DELETE returns JSON error, not HTML, when the delete throws', async () => {
    setAuth(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.delete.mockImplementation(() => { throw new Error('db down') })

    const { DELETE } = await import('@/app/api/resume-versions/[id]/route')
    const req = new NextRequest('http://localhost/api/resume-versions/1', {
      method: 'DELETE',
      headers: { authorization: 'Bearer test-key' },
    })
    await expectJsonError(await DELETE(req, makeParams('1')))
  })
})

describe('two-user adversarial resume isolation', () => {
  it('returns the same 404 for a missing or wrong-owner resume and pins update/delete to the caller', async () => {
    setAuth(true, 2)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.select.mockReturnValue(makeChain([]))
    const { GET } = await import('@/app/api/resume-versions/route')
    expect((await GET(new NextRequest('http://localhost/api/resume-versions'))).status).toBe(200)
    expect(renderParams(lastWhere)).toContain(2)
    expect(renderParams(lastWhere)).not.toContain(1)
    mockDb.update.mockReturnValue(makeChain([]))
    const { PATCH, DELETE } = await import('@/app/api/resume-versions/[id]/route')
    const patchResponse = await PATCH(makeReq('http://localhost/api/resume-versions/41', { label: 'blocked' }, true, 'PATCH'), makeParams('41'))
    expect(patchResponse.status).toBe(404)
    expect(renderParams(lastWhere)).toEqual(expect.arrayContaining([2, 41]))
    expect(renderParams(lastWhere)).not.toContain(1)

    mockDb.delete.mockReturnValue(makeChain([]))
    const deleteResponse = await DELETE(new NextRequest('http://localhost/api/resume-versions/41', { method: 'DELETE' }), makeParams('41'))
    expect(deleteResponse.status).toBe(404)
    expect(await deleteResponse.json()).toEqual({ error: 'Not found' })
    expect(renderParams(lastWhere)).toEqual(expect.arrayContaining([2, 41]))
  })
})
