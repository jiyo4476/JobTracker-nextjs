import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Exercise the REAL admin gate (resolveAdminUser → requireAdminUser) end-to-end, driving
// only its upstream requireResolvedUser. This proves the admin decision is read from the
// resolved principal's verified `isAdmin` flag and can never be flipped by the request
// body/header/query. The DB is mocked; everything else is real.
vi.mock('@/lib/resolved-user', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/resolved-user')>()
  return { ...actual, requireResolvedUser: vi.fn() }
})

vi.mock('@/db', () => ({
  db: {
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
}))

import { requireResolvedUser } from '@/lib/resolved-user'
import { AuthenticationError } from '@/lib/auth'
import { db } from '@/db'

function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {}
  const terminal = Promise.resolve(result)
  const methods = ['from', 'innerJoin', 'where', 'orderBy', 'limit', 'set', 'values', 'returning', 'onConflictDoNothing']
  methods.forEach(m => { chain[m] = vi.fn(() => chain) })
  chain.then = terminal.then.bind(terminal)
  chain.catch = terminal.catch.bind(terminal)
  return chain
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makeReq(path: string, body?: unknown, method = 'PATCH') {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: 'Bearer test-key' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

// A resolved user whose verified principal carries the given admin flag.
function resolveAs(isAdmin: boolean) {
  vi.mocked(requireResolvedUser).mockResolvedValue({
    id: 1,
    issuer: 'https://issuer/',
    subject: 'sub',
    email: null,
    displayName: null,
    principal: {
      kind: 'user',
      issuer: 'https://issuer/',
      subject: 'sub',
      scopes: [],
      groups: [],
      method: 'bearer',
      identityKey: 'https://issuer/#sub',
      correlationId: 'corr-1',
      isAdmin,
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('admin gate — resolveAdminUser', () => {
  it('rejects an authenticated non-admin with a non-disclosing 403 Forbidden', async () => {
    resolveAs(false)
    const { resolveAdminUser } = await import('@/lib/admin')
    const result = await resolveAdminUser(makeReq('/api/admin/jobs', {}, 'POST'))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(403)
      expect(await result.response.json()).toEqual({ error: 'Forbidden' })
    }
  })

  it('accepts a verified admin principal', async () => {
    resolveAs(true)
    const { resolveAdminUser } = await import('@/lib/admin')
    const result = await resolveAdminUser(makeReq('/api/admin/jobs', {}, 'POST'))
    expect(result.ok).toBe(true)
  })

  it('maps unauthenticated to 401 (service principals are rejected upstream)', async () => {
    vi.mocked(requireResolvedUser).mockRejectedValue(new AuthenticationError('unauthenticated', 'c'))
    const { resolveAdminUser } = await import('@/lib/admin')
    const result = await resolveAdminUser(makeReq('/api/admin/jobs', {}, 'POST'))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
  })

  it('maps a wrong-principal (e.g. service token) to 401', async () => {
    vi.mocked(requireResolvedUser).mockRejectedValue(new AuthenticationError('wrong_principal', 'c'))
    const { resolveAdminUser } = await import('@/lib/admin')
    const result = await resolveAdminUser(makeReq('/api/admin/jobs', {}, 'POST'))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
  })

  it('ignores an admin claim smuggled in the request body', async () => {
    // Principal is non-admin; body says otherwise. The gate must still deny.
    resolveAs(false)
    const { resolveAdminUser } = await import('@/lib/admin')
    const result = await resolveAdminUser(
      makeReq('/api/admin/jobs', { isAdmin: true, is_admin: true, admin: true }, 'POST'),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(403)
  })
})

describe('POST /api/admin/jobs (catalog create)', () => {
  it('403 for a non-admin', async () => {
    resolveAs(false)
    const { POST } = await import('@/app/api/admin/jobs/route')
    const res = await POST(makeReq('/api/admin/jobs', { job_title: 'Engineer', company_id: 1 }, 'POST'))
    expect(res.status).toBe(403)
  })

  it('201 for an admin', async () => {
    resolveAs(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.insert.mockReturnValue(makeChain([{ id: 42 }]))
    const { POST } = await import('@/app/api/admin/jobs/route')
    const res = await POST(makeReq('/api/admin/jobs', { job_title: 'Engineer', company_id: 1 }, 'POST'))
    expect(res.status).toBe(201)
    expect(await res.json()).toHaveProperty('job_id', 42)
  })

  it.each([
    { notes: 'private notes' },
    { priority: 5 },
    { has_applied: true },
    { interview_stage: 'phone_screen' },
  ])('400 — catalog create rejects the personal-state field %j', async (personalState) => {
    resolveAs(true)
    const { POST } = await import('@/app/api/admin/jobs/route')
    const res = await POST(makeReq(
      '/api/admin/jobs',
      { job_title: 'Engineer', ...personalState },
      'POST',
    ))
    expect(res.status).toBe(400)
    expect(db.insert).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/admin/jobs/[id] (catalog update)', () => {
  it('403 for a non-admin', async () => {
    resolveAs(false)
    const { PATCH } = await import('@/app/api/admin/jobs/[id]/route')
    const res = await PATCH(makeReq('/api/admin/jobs/1', { job_title: 'X' }), makeParams('1'))
    expect(res.status).toBe(403)
  })

  it('200 for an admin updating a catalog field', async () => {
    resolveAs(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.update.mockReturnValue(makeChain([{ id: 1 }]))
    const { PATCH } = await import('@/app/api/admin/jobs/[id]/route')
    const res = await PATCH(makeReq('/api/admin/jobs/1', { job_title: 'New' }), makeParams('1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
  })

  it('404 when the catalog job does not exist', async () => {
    resolveAs(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.update.mockReturnValue(makeChain([]))
    const { PATCH } = await import('@/app/api/admin/jobs/[id]/route')
    const res = await PATCH(makeReq('/api/admin/jobs/999', { job_title: 'New' }), makeParams('999'))
    expect(res.status).toBe(404)
  })

  it.each([
    { interview_stage: 'phone_screen' },
    { priority: 3 },
    { has_applied: true },
    { notes: 'mine' },
    { referral: true },
    { resume_version: 'v2' },
  ])('400 — catalog validator rejects the personal-state field %j', async (body) => {
    resolveAs(true)
    const { PATCH } = await import('@/app/api/admin/jobs/[id]/route')
    const res = await PATCH(makeReq('/api/admin/jobs/1', body), makeParams('1'))
    expect(res.status).toBe(400)
  })

  it.each(['1abc', '1.5', '1e2', '0', '-1', '9007199254740992'])(
    '400 — rejects malformed or unsafe job id %j without querying the database',
    async (id) => {
      resolveAs(true)
      const { PATCH } = await import('@/app/api/admin/jobs/[id]/route')
      const res = await PATCH(makeReq(`/api/admin/jobs/${id}`, { job_title: 'New' }), makeParams(id))
      expect(res.status).toBe(400)
      expect(db.update).not.toHaveBeenCalled()
    },
  )
})

describe('DELETE /api/admin/jobs/[id] (global soft-delete)', () => {
  it('403 for a non-admin', async () => {
    resolveAs(false)
    const { DELETE } = await import('@/app/api/admin/jobs/[id]/route')
    const res = await DELETE(makeReq('/api/admin/jobs/1', undefined, 'DELETE'), makeParams('1'))
    expect(res.status).toBe(403)
  })

  it('200 for an admin', async () => {
    resolveAs(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.update.mockReturnValue(makeChain([{ id: 1 }]))
    const { DELETE } = await import('@/app/api/admin/jobs/[id]/route')
    const res = await DELETE(makeReq('/api/admin/jobs/1', undefined, 'DELETE'), makeParams('1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
  })

  it('404 when the job is missing', async () => {
    resolveAs(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.update.mockReturnValue(makeChain([]))
    const { DELETE } = await import('@/app/api/admin/jobs/[id]/route')
    const res = await DELETE(makeReq('/api/admin/jobs/999', undefined, 'DELETE'), makeParams('999'))
    expect(res.status).toBe(404)
  })

  it.each(['1abc', '1.5', '1e2'])(
    '400 — rejects malformed job id %j without mutating the database',
    async (id) => {
      resolveAs(true)
      const { DELETE } = await import('@/app/api/admin/jobs/[id]/route')
      const res = await DELETE(makeReq(`/api/admin/jobs/${id}`, undefined, 'DELETE'), makeParams(id))
      expect(res.status).toBe(400)
      expect(db.update).not.toHaveBeenCalled()
    },
  )
})

describe('PATCH /api/admin/jobs/[id]/salary', () => {
  it('403 for a non-admin', async () => {
    resolveAs(false)
    const { PATCH } = await import('@/app/api/admin/jobs/[id]/salary/route')
    const res = await PATCH(
      makeReq('/api/admin/jobs/1/salary', { salary_type: 'annual', salary_min: 8000000, salary_max: 12000000 }),
      makeParams('1'),
    )
    expect(res.status).toBe(403)
  })

  it('200 for an admin', async () => {
    resolveAs(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.update.mockReturnValue(makeChain([{ id: 1, salaryMin: 8000000, salaryMax: 12000000 }]))
    const { PATCH } = await import('@/app/api/admin/jobs/[id]/salary/route')
    const res = await PATCH(
      makeReq('/api/admin/jobs/1/salary', { salary_type: 'annual', salary_min: 8000000, salary_max: 12000000 }),
      makeParams('1'),
    )
    expect(res.status).toBe(200)
  })

  it('400 for a malformed job id without mutating the database', async () => {
    resolveAs(true)
    const { PATCH } = await import('@/app/api/admin/jobs/[id]/salary/route')
    const res = await PATCH(
      makeReq('/api/admin/jobs/1abc/salary', { salary_type: 'annual', salary_min: 8000000, salary_max: 12000000 }),
      makeParams('1abc'),
    )
    expect(res.status).toBe(400)
    expect(db.update).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/admin/jobs/[id]/tags', () => {
  it('403 for a non-admin', async () => {
    resolveAs(false)
    const { PATCH } = await import('@/app/api/admin/jobs/[id]/tags/route')
    const res = await PATCH(makeReq('/api/admin/jobs/1/tags', { skills: ['Python'] }), makeParams('1'))
    expect(res.status).toBe(403)
  })

  it('400 for a malformed job id without querying the database', async () => {
    resolveAs(true)
    const { PATCH } = await import('@/app/api/admin/jobs/[id]/tags/route')
    const res = await PATCH(
      makeReq('/api/admin/jobs/1abc/tags', { skills: ['Python'] }),
      makeParams('1abc'),
    )
    expect(res.status).toBe(400)
    expect(db.select).not.toHaveBeenCalled()
  })
})
