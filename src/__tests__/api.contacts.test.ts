import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({
  requireApiKey: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
}))

vi.mock('@/db/schema', () => ({
  contacts: {},
}))

import { requireApiKey } from '@/lib/auth'
import { db } from '@/db'

function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {}
  const terminal = Promise.resolve(result)
  const methods = ['from', 'where', 'orderBy', 'set', 'values', 'returning']
  methods.forEach(m => { chain[m] = vi.fn(() => chain) })
  chain.then = terminal.then.bind(terminal)
  chain.catch = terminal.catch.bind(terminal)
  return chain
}

function makeParams(id: string, contactId?: string) {
  return { params: Promise.resolve(contactId ? { id, contactId } : { id }) }
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

const mockContact = { id: 1, jobId: 1, name: 'Jane Doe', email: 'jane@example.com', createdAt: new Date().toISOString() }

describe('GET /api/jobs/[id]/contacts', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 400 for non-numeric id', async () => {
    const { GET } = await import('@/app/api/jobs/[id]/contacts/route')
    const req = new NextRequest('http://localhost/api/jobs/abc/contacts')
    const res = await GET(req, makeParams('abc') as { params: Promise<{ id: string }> })
    expect(res.status).toBe(400)
  })

  it('returns 200 with contacts list', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.select.mockReturnValue(makeChain([mockContact]))

    const { GET } = await import('@/app/api/jobs/[id]/contacts/route')
    const req = new NextRequest('http://localhost/api/jobs/1/contacts')
    const res = await GET(req, makeParams('1') as { params: Promise<{ id: string }> })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json)).toBe(true)
    expect(json[0]).toHaveProperty('name', 'Jane Doe')
  })
})

describe('POST /api/jobs/[id]/contacts', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 without auth', async () => {
    vi.mocked(requireApiKey).mockReturnValue(false)
    const { POST } = await import('@/app/api/jobs/[id]/contacts/route')
    const res = await POST(makeReq('http://localhost/api/jobs/1/contacts', { name: 'Jane' }, false), makeParams('1') as { params: Promise<{ id: string }> })
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid body', async () => {
    vi.mocked(requireApiKey).mockReturnValue(true)
    const { POST } = await import('@/app/api/jobs/[id]/contacts/route')
    // name is required, missing it should 400
    const res = await POST(makeReq('http://localhost/api/jobs/1/contacts', { email: 'not-an-email' }), makeParams('1') as { params: Promise<{ id: string }> })
    expect(res.status).toBe(400)
  })

  it('returns 201 on success', async () => {
    vi.mocked(requireApiKey).mockReturnValue(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.insert.mockReturnValue(makeChain([mockContact]))

    const { POST } = await import('@/app/api/jobs/[id]/contacts/route')
    const res = await POST(makeReq('http://localhost/api/jobs/1/contacts', { name: 'Jane Doe', email: 'jane@example.com' }), makeParams('1') as { params: Promise<{ id: string }> })
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json).toHaveProperty('name', 'Jane Doe')
  })
})

describe('PATCH /api/jobs/[id]/contacts/[contactId]', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 without auth', async () => {
    vi.mocked(requireApiKey).mockReturnValue(false)
    const { PATCH } = await import('@/app/api/jobs/[id]/contacts/[contactId]/route')
    const res = await PATCH(makeReq('http://localhost/api/jobs/1/contacts/1', { name: 'Jane' }, false, 'PATCH'), makeParams('1', '1') as { params: Promise<{ id: string; contactId: string }> })
    expect(res.status).toBe(401)
  })

  it('returns 404 when contact not found', async () => {
    vi.mocked(requireApiKey).mockReturnValue(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.update.mockReturnValue(makeChain([]))

    const { PATCH } = await import('@/app/api/jobs/[id]/contacts/[contactId]/route')
    const res = await PATCH(makeReq('http://localhost/api/jobs/1/contacts/999', { name: 'Jane' }, true, 'PATCH'), makeParams('1', '999') as { params: Promise<{ id: string; contactId: string }> })
    expect(res.status).toBe(404)
  })

  it('returns 200 on success', async () => {
    vi.mocked(requireApiKey).mockReturnValue(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.update.mockReturnValue(makeChain([{ id: 1 }]))

    const { PATCH } = await import('@/app/api/jobs/[id]/contacts/[contactId]/route')
    const res = await PATCH(makeReq('http://localhost/api/jobs/1/contacts/1', { name: 'Jane Updated' }, true, 'PATCH'), makeParams('1', '1') as { params: Promise<{ id: string; contactId: string }> })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('success', true)
  })
})

describe('DELETE /api/jobs/[id]/contacts/[contactId]', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 without auth', async () => {
    vi.mocked(requireApiKey).mockReturnValue(false)
    const { DELETE } = await import('@/app/api/jobs/[id]/contacts/[contactId]/route')
    const req = new NextRequest('http://localhost/api/jobs/1/contacts/1', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('1', '1') as { params: Promise<{ id: string; contactId: string }> })
    expect(res.status).toBe(401)
  })

  it('returns 404 when contact not found', async () => {
    vi.mocked(requireApiKey).mockReturnValue(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.delete.mockReturnValue(makeChain([]))

    const { DELETE } = await import('@/app/api/jobs/[id]/contacts/[contactId]/route')
    const req = new NextRequest('http://localhost/api/jobs/1/contacts/999', {
      method: 'DELETE',
      headers: { authorization: 'Bearer test-key' },
    })
    const res = await DELETE(req, makeParams('1', '999') as { params: Promise<{ id: string; contactId: string }> })
    expect(res.status).toBe(404)
  })

  it('returns 200 on success', async () => {
    vi.mocked(requireApiKey).mockReturnValue(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.delete.mockReturnValue(makeChain([{ id: 1 }]))

    const { DELETE } = await import('@/app/api/jobs/[id]/contacts/[contactId]/route')
    const req = new NextRequest('http://localhost/api/jobs/1/contacts/1', {
      method: 'DELETE',
      headers: { authorization: 'Bearer test-key' },
    })
    const res = await DELETE(req, makeParams('1', '1') as { params: Promise<{ id: string; contactId: string }> })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('success', true)
  })
})
