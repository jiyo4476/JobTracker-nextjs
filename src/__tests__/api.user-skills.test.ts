import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({
  requireApiKey: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: { select: vi.fn(), insert: vi.fn(), delete: vi.fn() },
}))

vi.mock('@/db/schema', () => ({
  userSkills: {},
  skills: {},
}))

import { requireApiKey } from '@/lib/auth'
import { db } from '@/db'

function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {}
  const terminal = Promise.resolve(result)
  const methods = ['from', 'leftJoin', 'innerJoin', 'where', 'orderBy', 'limit', 'values', 'returning', 'onConflictDoNothing', 'onConflictDoUpdate']
  methods.forEach(m => { chain[m] = vi.fn(() => chain) })
  chain.then = terminal.then.bind(terminal)
  chain.catch = terminal.catch.bind(terminal)
  return chain
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('GET /api/user-skills', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 without auth', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(false)
    const { GET } = await import('@/app/api/user-skills/route')
    const req = new NextRequest('http://localhost/api/user-skills')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns list of user skills joined with skill names', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
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
    vi.mocked(requireApiKey).mockResolvedValue(false)
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
    vi.mocked(requireApiKey).mockResolvedValue(true)
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
    vi.mocked(requireApiKey).mockResolvedValue(true)
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
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const { POST } = await import('@/app/api/user-skills/route')
    const req = new NextRequest('http://localhost/api/user-skills', {
      method: 'POST',
      body: JSON.stringify({ foo: 'bar' }),
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-key' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/user-skills/[id]', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 without auth', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(false)
    const { DELETE } = await import('@/app/api/user-skills/[id]/route')
    const req = new NextRequest('http://localhost/api/user-skills/1', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('1'))
    expect(res.status).toBe(401)
  })

  it('returns 400 for non-numeric id', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const { DELETE } = await import('@/app/api/user-skills/[id]/route')
    const req = new NextRequest('http://localhost/api/user-skills/abc', {
      method: 'DELETE',
      headers: { authorization: 'Bearer test-key' },
    })
    const res = await DELETE(req, makeParams('abc'))
    expect(res.status).toBe(400)
  })

  it('returns 404 when skill not in user_skills', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
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
    vi.mocked(requireApiKey).mockResolvedValue(true)
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
