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
  jobStatusHistory: {},
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
    vi.mocked(requireApiKey).mockResolvedValue(false)
    const { PATCH } = await import('@/app/api/jobs/[id]/route')
    const res = await PATCH(makeReq('1', {}, false), makeParams('1'))
    expect(res.status).toBe(401)
  })

  it('returns 400 for non-numeric id', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const { PATCH } = await import('@/app/api/jobs/[id]/route')
    const res = await PATCH(makeReq('bad', { job_title: 'X' }), makeParams('bad'))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid body', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const { PATCH } = await import('@/app/api/jobs/[id]/route')
    const res = await PATCH(makeReq('1', { interview_stage: 'invalid_stage_value' }), makeParams('1'))
    expect(res.status).toBe(400)
  })

  it('returns 200 on success', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    // select is called to read current stage for history tracking
    mockDb.select.mockReturnValue(makeChain([{ interviewStage: 'not_applied' }]))
    mockDb.update.mockReturnValue(makeChain(undefined))

    const { PATCH } = await import('@/app/api/jobs/[id]/route')
    const res = await PATCH(makeReq('1', { job_title: 'New Title' }), makeParams('1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('success', true)
  })

  it('updates the company relationship when company_id is provided', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    const updateChain = makeChain(undefined)
    mockDb.update.mockReturnValue(updateChain)

    const { PATCH } = await import('@/app/api/jobs/[id]/route')
    const res = await PATCH(makeReq('1', { company_id: 42 }), makeParams('1'))

    expect(res.status).toBe(200)
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 42 }),
    )
  })

  it('clears optional classification fields when null is provided', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    const updateChain = makeChain(undefined)
    mockDb.update.mockReturnValue(updateChain)

    const { PATCH } = await import('@/app/api/jobs/[id]/route')
    const res = await PATCH(
      makeReq('1', { job_type: null, experience_level: null }),
      makeParams('1'),
    )

    expect(res.status).toBe(200)
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ jobType: null, experienceLevel: null }),
    )
  })

  it('clears priority when null is provided', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    const updateChain = makeChain(undefined)
    mockDb.update.mockReturnValue(updateChain)

    const { PATCH } = await import('@/app/api/jobs/[id]/route')
    const res = await PATCH(makeReq('1', { priority: null }), makeParams('1'))

    expect(res.status).toBe(200)
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ priority: null }),
    )
  })

  it('inserts stage history row when interview_stage changes', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    // current stage is applied; we're changing to phone_screen
    mockDb.select.mockReturnValue(makeChain([{ interviewStage: 'applied' }]))
    mockDb.update.mockReturnValue(makeChain(undefined))
    mockDb.insert.mockReturnValue(makeChain([]))

    const { PATCH } = await import('@/app/api/jobs/[id]/route')
    const res = await PATCH(makeReq('1', { interview_stage: 'phone_screen' }), makeParams('1'))
    expect(res.status).toBe(200)
    expect(mockDb.insert).toHaveBeenCalled()
  })
})

describe('PATCH /api/jobs/[id] — salary recomputation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireApiKey).mockResolvedValue(true)
  })

  it('reads salary_type from DB and computes annualEquivalentMin when only hourly_rate_min is patched', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    // DB returns existing salary_type = 'hourly'; no stage change so only one select
    mockDb.select.mockReturnValue(makeChain([{ salaryType: 'hourly' }]))
    const updateChain = makeChain(undefined)
    mockDb.update.mockReturnValue(updateChain)

    const { PATCH } = await import('@/app/api/jobs/[id]/route')
    const res = await PATCH(makeReq('1', { hourly_rate_min: 50 }), makeParams('1'))
    expect(res.status).toBe(200)

    const setSpy = updateChain.set as ReturnType<typeof vi.fn>
    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({ annualEquivalentMin: Math.round(50 * 2080 * 100) }),
    )
  })

  it('does not set annualEquivalentMin or annualEquivalentMax when no salary fields are in the patch', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    // No salary fields → salaryFieldsChanged is false → no salary DB read, no annual equivalent update
    const updateChain = makeChain(undefined)
    mockDb.update.mockReturnValue(updateChain)

    const { PATCH } = await import('@/app/api/jobs/[id]/route')
    const res = await PATCH(makeReq('1', { job_title: 'Senior Engineer' }), makeParams('1'))
    expect(res.status).toBe(200)

    const setSpy = updateChain.set as ReturnType<typeof vi.fn>
    const callArgs = setSpy.mock.calls[0][0] as Record<string, unknown>
    expect(callArgs).not.toHaveProperty('annualEquivalentMin')
    expect(callArgs).not.toHaveProperty('annualEquivalentMax')
  })

  it('computes annualEquivalentMin from salary_min when salary_type from DB is annual', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    // Patching salary_min only — salary_type must be read from DB
    mockDb.select.mockReturnValue(makeChain([{ salaryType: 'annual' }]))
    const updateChain = makeChain(undefined)
    mockDb.update.mockReturnValue(updateChain)

    const { PATCH } = await import('@/app/api/jobs/[id]/route')
    const res = await PATCH(makeReq('1', { salary_min: 9000000 }), makeParams('1'))
    expect(res.status).toBe(200)

    const setSpy = updateChain.set as ReturnType<typeof vi.fn>
    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({ annualEquivalentMin: 9000000 }),
    )
  })
})

describe('DELETE /api/jobs/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 without auth', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(false)
    const { DELETE } = await import('@/app/api/jobs/[id]/route')
    const req = new NextRequest('http://localhost/api/jobs/1', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('1'))
    expect(res.status).toBe(401)
  })

  it('returns 200 on soft delete', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.update.mockReturnValue(makeChain([{ id: 1 }]))

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

  it('returns 404 when job is not found', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.update.mockReturnValue(makeChain([]))

    const { DELETE } = await import('@/app/api/jobs/[id]/route')
    const req = new NextRequest('http://localhost/api/jobs/999', {
      method: 'DELETE',
      headers: { authorization: 'Bearer test-key' },
    })
    const res = await DELETE(req, makeParams('999'))
    expect(res.status).toBe(404)
  })

  it('returns 400 for non-numeric id', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const { DELETE } = await import('@/app/api/jobs/[id]/route')
    const req = new NextRequest('http://localhost/api/jobs/abc', {
      method: 'DELETE',
      headers: { authorization: 'Bearer test-key' },
    })
    const res = await DELETE(req, makeParams('abc'))
    expect(res.status).toBe(400)
  })

  it('calls db.update (soft delete, not hard delete)', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.update.mockReturnValue(makeChain([{ id: 1 }]))

    const { DELETE } = await import('@/app/api/jobs/[id]/route')
    const req = new NextRequest('http://localhost/api/jobs/1', {
      method: 'DELETE',
      headers: { authorization: 'Bearer test-key' },
    })
    await DELETE(req, makeParams('1'))
    expect(mockDb.update).toHaveBeenCalled()
  })
})
