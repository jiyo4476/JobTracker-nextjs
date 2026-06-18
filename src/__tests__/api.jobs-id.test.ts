import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({
  requireApiKey: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: { select: vi.fn(), update: vi.fn(), insert: vi.fn() },
}))

vi.mock('@/db/schema', () => ({
  jobs: {},
  companies: {},
  skills: {},
  software: {},
  keywords: {},
  certifications: {},
  jobSkills: {},
  jobSoftware: {},
  jobKeywords: {},
  jobCertifications: {},
  contacts: {},
}))

import { requireApiKey } from '@/lib/auth'
import { db } from '@/db'

function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {}
  const terminal = Promise.resolve(result)
  const methods = ['from', 'leftJoin', 'innerJoin', 'where', 'orderBy', 'limit', 'offset', 'groupBy', 'set', 'values', 'returning']
  methods.forEach(m => { chain[m] = vi.fn(() => chain) })
  chain.then = terminal.then.bind(terminal)
  chain.catch = terminal.catch.bind(terminal)
  return chain
}

const mockJob = {
  id: 1, jobTitle: 'Engineer', jobLink: 'https://x.com', jobLocation: 'NYC',
  isRemote: true, interviewStage: 'applied', companyName: 'Acme', companyId: 5,
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makeReq(id: string, body?: unknown, auth = true, method = 'PATCH') {
  return new NextRequest(`http://localhost/api/jobs/${id}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(auth ? { authorization: 'Bearer test-key' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe('GET /api/jobs/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 for non-numeric id', async () => {
    const { GET } = await import('@/app/api/jobs/[id]/route')
    const req = new NextRequest('http://localhost/api/jobs/abc')
    const res = await GET(req, makeParams('abc'))
    expect(res.status).toBe(400)
  })

  it('returns 404 when job not found', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.select.mockReturnValue(makeChain([]))
    const { GET } = await import('@/app/api/jobs/[id]/route')
    const req = new NextRequest('http://localhost/api/jobs/999')
    const res = await GET(req, makeParams('999'))
    expect(res.status).toBe(404)
  })

  it('returns 200 with job and related arrays', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    let callCount = 0
    mockDb.select.mockImplementation(() => {
      callCount++
      if (callCount === 1) return makeChain([mockJob])
      return makeChain([])
    })

    const { GET } = await import('@/app/api/jobs/[id]/route')
    const req = new NextRequest('http://localhost/api/jobs/1')
    const res = await GET(req, makeParams('1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('jobTitle', 'Engineer')
    expect(json).toHaveProperty('skills')
    expect(json).toHaveProperty('software')
    expect(json).toHaveProperty('keywords')
    expect(json).toHaveProperty('certifications')
    expect(json).toHaveProperty('contacts')
  })
})

describe('PATCH /api/jobs/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 without auth', async () => {
    vi.mocked(requireApiKey).mockReturnValue(false)
    const { PATCH } = await import('@/app/api/jobs/[id]/route')
    const res = await PATCH(makeReq('1', {}, false), makeParams('1'))
    expect(res.status).toBe(401)
  })

  it('returns 400 for non-numeric id', async () => {
    vi.mocked(requireApiKey).mockReturnValue(true)
    const { PATCH } = await import('@/app/api/jobs/[id]/route')
    const res = await PATCH(makeReq('bad', { job_title: 'X' }), makeParams('bad'))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid body', async () => {
    vi.mocked(requireApiKey).mockReturnValue(true)
    const { PATCH } = await import('@/app/api/jobs/[id]/route')
    const res = await PATCH(makeReq('1', { interview_stage: 'invalid_stage_value' }), makeParams('1'))
    expect(res.status).toBe(400)
  })

  it('returns 200 on success', async () => {
    vi.mocked(requireApiKey).mockReturnValue(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.update.mockReturnValue(makeChain(undefined))

    const { PATCH } = await import('@/app/api/jobs/[id]/route')
    const res = await PATCH(makeReq('1', { job_title: 'New Title' }), makeParams('1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('success', true)
  })
})

describe('DELETE /api/jobs/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 without auth', async () => {
    vi.mocked(requireApiKey).mockReturnValue(false)
    const { DELETE } = await import('@/app/api/jobs/[id]/route')
    const req = new NextRequest('http://localhost/api/jobs/1', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('1'))
    expect(res.status).toBe(401)
  })

  it('returns 200 on soft delete', async () => {
    vi.mocked(requireApiKey).mockReturnValue(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.update.mockReturnValue(makeChain(undefined))

    const { DELETE } = await import('@/app/api/jobs/[id]/route')
    const req = new NextRequest('http://localhost/api/jobs/1', {
      method: 'DELETE',
      headers: { authorization: 'Bearer test-key' },
    })
    const res = await DELETE(req, makeParams('1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('success', true)
  })

  it('calls db.update (soft delete, not hard delete)', async () => {
    vi.mocked(requireApiKey).mockReturnValue(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.update.mockReturnValue(makeChain(undefined))

    const { DELETE } = await import('@/app/api/jobs/[id]/route')
    const req = new NextRequest('http://localhost/api/jobs/1', {
      method: 'DELETE',
      headers: { authorization: 'Bearer test-key' },
    })
    await DELETE(req, makeParams('1'))
    expect(mockDb.update).toHaveBeenCalled()
  })
})
