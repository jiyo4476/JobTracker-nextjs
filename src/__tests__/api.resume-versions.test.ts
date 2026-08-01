import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({
  requireAuthentication: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
}))

vi.mock('@/db/schema', () => ({
  resumeVersions: {},
}))

import { requireAuthentication } from '@/lib/auth'
import { db } from '@/db'

function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {}
  const terminal = Promise.resolve(result)
  const methods = ['from', 'where', 'orderBy', 'limit', 'values', 'returning', 'set']
  methods.forEach(m => { chain[m] = vi.fn(() => chain) })
  chain.then = terminal.then.bind(terminal)
  chain.catch = terminal.catch.bind(terminal)
  return chain
}

const mockVersion = { id: 1, label: 'v1', date: '2024-01-01', notes: 'Initial', createdAt: new Date() }

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
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

  it('returns list of resume versions', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.select.mockReturnValue(makeChain([mockVersion]))

    const { GET } = await import('@/app/api/resume-versions/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json)).toBe(true)
    expect(json[0]).toHaveProperty('label', 'v1')
  })
})

describe('POST /api/resume-versions', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 without auth', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(false)
    const { POST } = await import('@/app/api/resume-versions/route')
    const res = await POST(makeReq('http://localhost/api/resume-versions', { label: 'v1' }, false))
    expect(res.status).toBe(401)
  })

  it('returns 400 for missing label', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    const { POST } = await import('@/app/api/resume-versions/route')
    const res = await POST(makeReq('http://localhost/api/resume-versions', { notes: 'no label' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid date format', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    const { POST } = await import('@/app/api/resume-versions/route')
    const res = await POST(makeReq('http://localhost/api/resume-versions', { label: 'v1', date: 'not-a-date' }))
    expect(res.status).toBe(400)
  })

  it('returns 201 on success', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
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
    vi.mocked(requireAuthentication).mockResolvedValue(false)
    const { PATCH } = await import('@/app/api/resume-versions/[id]/route')
    const res = await PATCH(makeReq('http://localhost/api/resume-versions/1', { label: 'v2' }, false, 'PATCH'), makeParams('1'))
    expect(res.status).toBe(401)
  })

  it('returns 400 for non-numeric id', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    const { PATCH } = await import('@/app/api/resume-versions/[id]/route')
    const res = await PATCH(makeReq('http://localhost/api/resume-versions/abc', { label: 'v2' }, true, 'PATCH'), makeParams('abc'))
    expect(res.status).toBe(400)
  })

  it('returns 400 for extra unknown fields (strict)', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    const { PATCH } = await import('@/app/api/resume-versions/[id]/route')
    const res = await PATCH(makeReq('http://localhost/api/resume-versions/1', { label: 'v2', unknown_field: true }, true, 'PATCH'), makeParams('1'))
    expect(res.status).toBe(400)
  })

  it('returns 200 on success', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.update.mockReturnValue(makeChain([{ id: 1 }]))

    const { PATCH } = await import('@/app/api/resume-versions/[id]/route')
    const res = await PATCH(makeReq('http://localhost/api/resume-versions/1', { label: 'v2' }, true, 'PATCH'), makeParams('1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('success', true)
  })

  it('returns 404 when id not found', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
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
    vi.mocked(requireAuthentication).mockResolvedValue(false)
    const { DELETE } = await import('@/app/api/resume-versions/[id]/route')
    const req = new NextRequest('http://localhost/api/resume-versions/1', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('1'))
    expect(res.status).toBe(401)
  })

  it('returns 400 for non-numeric id', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    const { DELETE } = await import('@/app/api/resume-versions/[id]/route')
    const req = new NextRequest('http://localhost/api/resume-versions/abc', {
      method: 'DELETE',
      headers: { authorization: 'Bearer test-key' },
    })
    const res = await DELETE(req, makeParams('abc'))
    expect(res.status).toBe(400)
  })

  it('returns 404 when not found', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
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
    vi.mocked(requireAuthentication).mockResolvedValue(true)
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
