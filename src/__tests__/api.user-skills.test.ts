import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { expectJsonError } from './helpers/json-error'

vi.mock('@/lib/auth', () => ({
  requireAuthentication: vi.fn(),
}))

vi.mock('@/lib/resolved-user', () => ({ resolveRequestUser: vi.fn() }))
vi.mock('@/db/session', () => ({
  withUser: vi.fn((_userId: number, callback: (tx: unknown) => unknown) => callback(db)),
}))

vi.mock('@/db', () => ({
  db: { select: vi.fn(), insert: vi.fn(), delete: vi.fn() },
}))

vi.mock('@/db/schema', () => ({
  userSkills: {},
  skills: {},
}))

import { requireAuthentication } from '@/lib/auth'
import { resolveRequestUser } from '@/lib/resolved-user'
import { db } from '@/db'

let lastWhere: unknown
function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {}
  const terminal = Promise.resolve(result)
  const methods = ['from', 'leftJoin', 'innerJoin', 'where', 'orderBy', 'limit', 'values', 'returning', 'onConflictDoNothing', 'onConflictDoUpdate']
  methods.forEach(m => { chain[m] = vi.fn(() => chain) })
  chain.where = vi.fn((value: unknown) => { lastWhere = value; return chain })
  chain.then = terminal.then.bind(terminal)
  chain.catch = terminal.catch.bind(terminal)
  return chain
}

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

describe('GET /api/user-skills', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 without auth', async () => {
    setAuth(false)
    const { GET } = await import('@/app/api/user-skills/route')
    const req = new NextRequest('http://localhost/api/user-skills')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns list of user skills joined with skill names', async () => {
    setAuth(true)
    const mockRows = [
      { skillId: 1, name: 'TypeScript', hasSkill: true },
      { skillId: 2, name: 'Python', hasSkill: false },
    ]
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.select.mockReturnValue(makeChain(mockRows))

    const { GET } = await import('@/app/api/user-skills/route')
    const req = new NextRequest('http://localhost/api/user-skills', {
      headers: { authorization: 'Bearer test-key' },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual(mockRows)
  })
})

describe('POST /api/user-skills', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 without auth', async () => {
    setAuth(false)
    const { POST } = await import('@/app/api/user-skills/route')
    const req = new NextRequest('http://localhost/api/user-skills', {
      method: 'POST',
      body: JSON.stringify({ skill_id: 1 }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('creates by skill_id', async () => {
    setAuth(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.insert.mockReturnValue(makeChain(undefined))

    const { POST } = await import('@/app/api/user-skills/route')
    const req = new NextRequest('http://localhost/api/user-skills', {
      method: 'POST',
      body: JSON.stringify({ skill_id: 3 }),
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-key' },
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json).toHaveProperty('success', true)
    expect(json).toHaveProperty('skillId', 3)
  })

  it('creates by name (upserts into skills first)', async () => {
    setAuth(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    // First insert (upsert into skills) returns id
    const upsertChain = makeChain([{ id: 7 }])
    // Second insert (into userSkills) returns nothing
    const insertChain = makeChain(undefined)
    let callCount = 0
    mockDb.insert.mockImplementation(() => {
      callCount++
      return callCount === 1 ? upsertChain : insertChain
    })

    const { POST } = await import('@/app/api/user-skills/route')
    const req = new NextRequest('http://localhost/api/user-skills', {
      method: 'POST',
      body: JSON.stringify({ name: 'Rust' }),
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-key' },
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json).toHaveProperty('skillId', 7)
    expect(mockDb.insert).toHaveBeenCalledTimes(2)
  })

  it('returns 400 for invalid body', async () => {
    setAuth(true)
    const { POST } = await import('@/app/api/user-skills/route')
    const req = new NextRequest('http://localhost/api/user-skills', {
      method: 'POST',
      body: JSON.stringify({ foo: 'bar' }),
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-key' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('rejects caller-supplied user_id without inserting', async () => {
    setAuth(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>

    const { POST } = await import('@/app/api/user-skills/route')
    const req = new NextRequest('http://localhost/api/user-skills', {
      method: 'POST',
      body: JSON.stringify({ skill_id: 3, user_id: 1 }),
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-key' },
    })
    const res = await POST(req)

    expect(res.status).toBe(400)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/user-skills/[id]', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 without auth', async () => {
    setAuth(false)
    const { DELETE } = await import('@/app/api/user-skills/[id]/route')
    const req = new NextRequest('http://localhost/api/user-skills/1', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('1'))
    expect(res.status).toBe(401)
  })

  it('returns 400 for non-numeric id', async () => {
    setAuth(true)
    const { DELETE } = await import('@/app/api/user-skills/[id]/route')
    const req = new NextRequest('http://localhost/api/user-skills/abc', {
      method: 'DELETE',
      headers: { authorization: 'Bearer test-key' },
    })
    const res = await DELETE(req, makeParams('abc'))
    expect(res.status).toBe(400)
  })

  it('returns 404 when skill not in user_skills', async () => {
    setAuth(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.delete.mockReturnValue(makeChain([]))

    const { DELETE } = await import('@/app/api/user-skills/[id]/route')
    const req = new NextRequest('http://localhost/api/user-skills/999', {
      method: 'DELETE',
      headers: { authorization: 'Bearer test-key' },
    })
    const res = await DELETE(req, makeParams('999'))
    expect(res.status).toBe(404)
  })

  it('returns 200 on successful delete', async () => {
    setAuth(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.delete.mockReturnValue(makeChain([{ skillId: 1, hasSkill: true }]))

    const { DELETE } = await import('@/app/api/user-skills/[id]/route')
    const req = new NextRequest('http://localhost/api/user-skills/1', {
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
describe('user-skills error envelope on DB failure', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('GET returns JSON error, not HTML, when the query throws', async () => {
    setAuth(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.select.mockImplementation(() => { throw new Error('db down') })

    const { GET } = await import('@/app/api/user-skills/route')
    const req = new NextRequest('http://localhost/api/user-skills', {
      headers: { authorization: 'Bearer test-key' },
    })
    await expectJsonError(await GET(req))
  })

  it('POST returns JSON error, not HTML, when the insert throws', async () => {
    setAuth(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.insert.mockImplementation(() => { throw new Error('db down') })

    const { POST } = await import('@/app/api/user-skills/route')
    const req = new NextRequest('http://localhost/api/user-skills', {
      method: 'POST',
      body: JSON.stringify({ skill_id: 3 }),
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-key' },
    })
    await expectJsonError(await POST(req))
  })

  it('DELETE returns JSON error, not HTML, when the delete throws', async () => {
    setAuth(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.delete.mockImplementation(() => { throw new Error('db down') })

    const { DELETE } = await import('@/app/api/user-skills/[id]/route')
    const req = new NextRequest('http://localhost/api/user-skills/1', {
      method: 'DELETE',
      headers: { authorization: 'Bearer test-key' },
    })
    await expectJsonError(await DELETE(req, makeParams('1')))
  })
})

describe('two-user adversarial skill isolation', () => {
  it('scopes reads and non-disclosing deletes to user B, never user A', async () => {
    setAuth(true, 2)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.select.mockReturnValue(makeChain([]))
    const { GET } = await import('@/app/api/user-skills/route')
    expect((await GET(new NextRequest('http://localhost/api/user-skills'))).status).toBe(200)
    expect(renderParams(lastWhere)).toContain(2)
    expect(renderParams(lastWhere)).not.toContain(1)

    mockDb.delete.mockReturnValue(makeChain([]))
    const { DELETE } = await import('@/app/api/user-skills/[id]/route')
    const response = await DELETE(new NextRequest('http://localhost/api/user-skills/17', { method: 'DELETE' }), makeParams('17'))
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Not found' })
    expect(renderParams(lastWhere)).toEqual(expect.arrayContaining([2, 17]))
  })
})
