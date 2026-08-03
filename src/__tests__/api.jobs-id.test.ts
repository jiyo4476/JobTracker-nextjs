import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// GET is owner-scoped (resolveRequestUser + withUser); PATCH/DELETE are now admin-only
// catalog mutations (API-013 slice 1) gated by resolveAdminUser, on the shared `db` client.
vi.mock('@/lib/resolved-user', () => ({
  resolveRequestUser: vi.fn(),
}))

vi.mock('@/lib/admin', () => ({
  resolveAdminUser: vi.fn(),
}))

vi.mock('@/db/session', () => ({
  withUser: vi.fn(),
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
  userJobState: {},
  userJobContacts: {},
  resumeVersions: {},
  contacts: {},
}))

import { NextResponse } from 'next/server'
import { resolveRequestUser } from '@/lib/resolved-user'
import { resolveAdminUser } from '@/lib/admin'
import { withUser } from '@/db/session'
import { db } from '@/db'
import { authedGet } from './helpers/authed-request'

const adminOk = { ok: true as const, user: { id: 1, issuer: 'https://issuer/', subject: 'admin', principal: {} as never } }
function forbidden() { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

// withUser(id, fn) → fn(tx); tx.select returns [job] on the first call, [] after —
// enough for the detail route's job/state/taxonomy/contacts reads.
function setupResolvedUser(userId = 1) {
  vi.mocked(resolveRequestUser).mockResolvedValue({
    ok: true,
    user: { id: userId, issuer: 'https://issuer/', subject: 'sub', principal: {} as never },
  })
}
function setupOwnerScopedGet(firstResult: unknown[]) {
  vi.mocked(withUser).mockImplementation(async (_id, fn) => {
    let call = 0
    const tx = { select: vi.fn(() => { call++; return makeChain(call === 1 ? firstResult : []) }) }
    return fn(tx as never)
  })
}
function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

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

describe('GET /api/jobs/[id] (owner-scoped)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupResolvedUser()
  })

  it('returns 401 when the user cannot be resolved', async () => {
    vi.mocked(resolveRequestUser).mockResolvedValue({ ok: false, response: unauthorized() })
    const { GET } = await import('@/app/api/jobs/[id]/route')
    const req = new NextRequest('http://localhost/api/jobs/1')
    const res = await GET(req, makeParams('1'))
    expect(res.status).toBe(401)
  })

  it('returns 400 for non-numeric id', async () => {
    const { GET } = await import('@/app/api/jobs/[id]/route')
    const req = authedGet('http://localhost/api/jobs/abc')
    const res = await GET(req, makeParams('abc'))
    expect(res.status).toBe(400)
  })

  it('returns 404 when job not found', async () => {
    setupOwnerScopedGet([])
    const { GET } = await import('@/app/api/jobs/[id]/route')
    const req = authedGet('http://localhost/api/jobs/999')
    const res = await GET(req, makeParams('999'))
    expect(res.status).toBe(404)
  })

  it('returns 200 with catalog facts, userState:null when untracked, and private cache header', async () => {
    setupOwnerScopedGet([mockJob])
    const { GET } = await import('@/app/api/jobs/[id]/route')
    const req = authedGet('http://localhost/api/jobs/1')
    const res = await GET(req, makeParams('1'))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    const json = await res.json()
    expect(json).toHaveProperty('jobTitle', 'Engineer')
    expect(json).toHaveProperty('userState', null)
    expect(json).toHaveProperty('isTracked', false)
    expect(json).toHaveProperty('skills')
    expect(json).toHaveProperty('software')
    expect(json).toHaveProperty('keywords')
    expect(json).toHaveProperty('certifications')
    expect(json).toHaveProperty('contacts')
  })
})

describe('PATCH /api/jobs/[id] (deprecated admin alias, catalog-only)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveAdminUser).mockResolvedValue(adminOk)
  })

  it('returns 401 without auth', async () => {
    vi.mocked(resolveAdminUser).mockResolvedValue({ ok: false, response: unauthorized() })
    const { PATCH } = await import('@/app/api/jobs/[id]/route')
    const res = await PATCH(makeReq('1', {}, false), makeParams('1'))
    expect(res.status).toBe(401)
  })

  it('returns 403 (non-disclosing) for a non-admin user', async () => {
    vi.mocked(resolveAdminUser).mockResolvedValue({ ok: false, response: forbidden() })
    const { PATCH } = await import('@/app/api/jobs/[id]/route')
    const res = await PATCH(makeReq('1', { job_title: 'X' }), makeParams('1'))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Forbidden' })
  })

  it('returns 400 for non-numeric id', async () => {
    const { PATCH } = await import('@/app/api/jobs/[id]/route')
    const res = await PATCH(makeReq('bad', { job_title: 'X' }), makeParams('bad'))
    expect(res.status).toBe(400)
  })

  it('rejects a personal-state field (interview_stage) as an unknown catalog key', async () => {
    const { PATCH } = await import('@/app/api/jobs/[id]/route')
    const res = await PATCH(makeReq('1', { interview_stage: 'phone_screen' }), makeParams('1'))
    expect(res.status).toBe(400)
  })

  it('rejects personal-state fields priority/notes/has_applied', async () => {
    const { PATCH } = await import('@/app/api/jobs/[id]/route')
    for (const body of [{ priority: 3 }, { notes: 'mine' }, { has_applied: true }]) {
      const res = await PATCH(makeReq('1', body), makeParams('1'))
      expect(res.status).toBe(400)
    }
  })

  it('returns 200 on success with a deprecation header', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.update.mockReturnValue(makeChain([{ id: 1 }]))

    const { PATCH } = await import('@/app/api/jobs/[id]/route')
    const res = await PATCH(makeReq('1', { job_title: 'New Title' }), makeParams('1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toHaveProperty('success', true)
    expect(res.headers.get('deprecation')).toBe('true')
    expect(res.headers.get('link')).toContain('/api/admin/jobs/[id]')
  })

  it('returns 404 when the catalog job does not exist', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.update.mockReturnValue(makeChain([]))

    const { PATCH } = await import('@/app/api/jobs/[id]/route')
    const res = await PATCH(makeReq('999', { job_title: 'New Title' }), makeParams('999'))
    expect(res.status).toBe(404)
  })

  it('updates the company relationship when company_id is provided', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    const updateChain = makeChain([{ id: 1 }])
    mockDb.update.mockReturnValue(updateChain)

    const { PATCH } = await import('@/app/api/jobs/[id]/route')
    const res = await PATCH(makeReq('1', { company_id: 42 }), makeParams('1'))

    expect(res.status).toBe(200)
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 42 }),
    )
  })

  it('clears the deletion marker when a job is restored', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    const updateChain = makeChain([{ id: 1 }])
    mockDb.update.mockReturnValue(updateChain)

    const { PATCH } = await import('@/app/api/jobs/[id]/route')
    const res = await PATCH(makeReq('1', { is_active: true }), makeParams('1'))

    expect(res.status).toBe(200)
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: true, deletedAt: null }),
    )
  })

  it('clears optional classification fields when null is provided', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    const updateChain = makeChain([{ id: 1 }])
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
})

describe('PATCH /api/jobs/[id] — salary recomputation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveAdminUser).mockResolvedValue(adminOk)
  })

  it('reads salary_type from DB and computes annualEquivalentMin when only hourly_rate_min is patched', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.select.mockReturnValue(makeChain([{ salaryType: 'hourly' }]))
    const updateChain = makeChain([{ id: 1 }])
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
    const updateChain = makeChain([{ id: 1 }])
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
    mockDb.select.mockReturnValue(makeChain([{ salaryType: 'annual' }]))
    const updateChain = makeChain([{ id: 1 }])
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

describe('DELETE /api/jobs/[id] (deprecated admin alias)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveAdminUser).mockResolvedValue(adminOk)
  })

  it('returns 401 without auth', async () => {
    vi.mocked(resolveAdminUser).mockResolvedValue({ ok: false, response: unauthorized() })
    const { DELETE } = await import('@/app/api/jobs/[id]/route')
    const req = new NextRequest('http://localhost/api/jobs/1', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('1'))
    expect(res.status).toBe(401)
  })

  it('returns 403 (non-disclosing) for a non-admin user', async () => {
    vi.mocked(resolveAdminUser).mockResolvedValue({ ok: false, response: forbidden() })
    const { DELETE } = await import('@/app/api/jobs/[id]/route')
    const req = new NextRequest('http://localhost/api/jobs/1', { method: 'DELETE', headers: { authorization: 'Bearer x' } })
    const res = await DELETE(req, makeParams('1'))
    expect(res.status).toBe(403)
  })

  it('returns 200 on soft delete with a deprecation header', async () => {
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
    expect(res.headers.get('deprecation')).toBe('true')
  })

  it('returns 404 when job is not found', async () => {
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
    const { DELETE } = await import('@/app/api/jobs/[id]/route')
    const req = new NextRequest('http://localhost/api/jobs/abc', {
      method: 'DELETE',
      headers: { authorization: 'Bearer test-key' },
    })
    const res = await DELETE(req, makeParams('abc'))
    expect(res.status).toBe(400)
  })

  it('calls db.update (soft delete, not hard delete)', async () => {
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
