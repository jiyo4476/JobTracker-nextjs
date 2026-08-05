import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

/**
 * API-013 — executable backing for `docs/legacy-compat-matrix.md`.
 *
 * Every row in that matrix must be asserted somewhere. Rows already covered by the
 * per-route suites stay there; this file covers the ones that were documented but had
 * no assertion:
 *
 *   §1  `Link: <successor>; rel="successor-version"` on all five deprecated aliases,
 *       including on non-2xx responses (the wrapper annotates whatever it receives).
 *   §2  The flattened personal fields on `GET /api/jobs` list rows, and the fact that
 *       list rows do NOT carry the nested `userState`.
 *   §3  The flattened ⇄ `userState` value invariant on `GET /api/jobs/[id]`, in both the
 *       tracked and untracked cases.
 */

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
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), transaction: vi.fn() },
}))

import { resolveRequestUser } from '@/lib/resolved-user'
import { resolveAdminUser } from '@/lib/admin'
import { withUser } from '@/db/session'
import { db } from '@/db'

const adminOk = {
  ok: true as const,
  user: {
    id: 1, issuer: 'https://issuer/', subject: 'admin',
    email: null, displayName: null, principal: {} as never,
  },
}
const forbidden = () => NextResponse.json({ error: 'Forbidden' }, { status: 403 })

function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {}
  const terminal = Promise.resolve(result)
  const methods = [
    'from', 'leftJoin', 'innerJoin', 'where', 'orderBy', 'limit', 'offset',
    'groupBy', 'set', 'values', 'returning', 'onConflictDoNothing',
  ]
  methods.forEach((m) => { chain[m] = vi.fn(() => chain) })
  chain.then = terminal.then.bind(terminal)
  chain.catch = terminal.catch.bind(terminal)
  chain.finally = terminal.finally.bind(terminal)
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

function resolveUserAs(userId = 1) {
  vi.mocked(resolveRequestUser).mockResolvedValue({
    ok: true,
    user: {
      id: userId, issuer: 'https://issuer/', subject: 'sub',
      email: null, displayName: null, principal: {} as never,
    },
  })
}

// ───────────────────────────────────────────────────────────────────────────────
// §1 — deprecated alias headers
// ───────────────────────────────────────────────────────────────────────────────

describe('matrix §1 — deprecated catalog-mutation aliases advertise their successor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveAdminUser).mockResolvedValue(adminOk)
  })

  function expectDeprecation(res: NextResponse, successor: string) {
    expect(res.headers.get('deprecation')).toBe('true')
    expect(res.headers.get('link')).toBe(`<${successor}>; rel="successor-version"`)
  }

  it('POST /api/jobs → /api/admin/jobs', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.insert.mockReturnValue(makeChain([{ id: 7 }]))
    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeReq('/api/jobs', { job_title: 'Engineer' }, 'POST'))
    expect(res.status).toBe(201)
    expectDeprecation(res, '/api/admin/jobs')
  })

  it('PATCH /api/jobs/[id] → /api/admin/jobs/[id]', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.update.mockReturnValue(makeChain([{ id: 1 }]))
    const { PATCH } = await import('@/app/api/jobs/[id]/route')
    const res = await PATCH(makeReq('/api/jobs/1', { job_title: 'New' }), makeParams('1'))
    expect(res.status).toBe(200)
    expectDeprecation(res, '/api/admin/jobs/[id]')
  })

  it('DELETE /api/jobs/[id] → /api/admin/jobs/[id]', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.update.mockReturnValue(makeChain([{ id: 1 }]))
    const { DELETE } = await import('@/app/api/jobs/[id]/route')
    const res = await DELETE(makeReq('/api/jobs/1', undefined, 'DELETE'), makeParams('1'))
    expect(res.status).toBe(200)
    expectDeprecation(res, '/api/admin/jobs/[id]')
  })

  it('PATCH /api/jobs/[id]/salary → /api/admin/jobs/[id]/salary', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.update.mockReturnValue(makeChain([{ id: 1, salaryMin: 8000000, salaryMax: 12000000 }]))
    const { PATCH } = await import('@/app/api/jobs/[id]/salary/route')
    const res = await PATCH(
      makeReq('/api/jobs/1/salary', { salary_type: 'annual', salary_min: 8000000, salary_max: 12000000 }),
      makeParams('1'),
    )
    expect(res.status).toBe(200)
    expectDeprecation(res, '/api/admin/jobs/[id]/salary')
  })

  it('PATCH /api/jobs/[id]/tags → /api/admin/jobs/[id]/tags', async () => {
    // A tags patch with no categories short-circuits before any DB work but still
    // returns through the alias wrapper.
    const { PATCH } = await import('@/app/api/jobs/[id]/tags/route')
    const res = await PATCH(makeReq('/api/jobs/1/tags', {}), makeParams('1'))
    expectDeprecation(res, '/api/admin/jobs/[id]/tags')
  })

  it('annotates non-2xx responses too, so a client discovers the successor while failing', async () => {
    vi.mocked(resolveAdminUser).mockResolvedValue({ ok: false, response: forbidden() })
    const { PATCH } = await import('@/app/api/jobs/[id]/route')
    const res = await PATCH(makeReq('/api/jobs/1', { job_title: 'X' }), makeParams('1'))
    expect(res.status).toBe(403)
    expectDeprecation(res, '/api/admin/jobs/[id]')
  })

  it('the canonical /api/admin/* routes are NOT marked deprecated', async () => {
    vi.mocked(resolveAdminUser).mockResolvedValue(adminOk)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.update.mockReturnValue(makeChain([{ id: 1 }]))
    const { PATCH } = await import('@/app/api/admin/jobs/[id]/route')
    const res = await PATCH(makeReq('/api/admin/jobs/1', { job_title: 'New' }), makeParams('1'))
    expect(res.status).toBe(200)
    expect(res.headers.get('deprecation')).toBeNull()
    expect(res.headers.get('link')).toBeNull()
  })
})

// ───────────────────────────────────────────────────────────────────────────────
// §2 — GET /api/jobs flattened list overlay
// ───────────────────────────────────────────────────────────────────────────────

describe('matrix §2 — GET /api/jobs emits the transitional flattened personal fields', () => {
  // One tracked row (state joined) and one untracked catalog row (join missed).
  const trackedRow = {
    id: 1, jobTitle: 'Engineer', companyName: 'Acme',
    stateUserId: 1, priority: 4, interviewStage: 'phone_screen',
    hasApplied: true, dateApplied: '2026-01-05', heardBack: true, isHidden: false,
  }
  const untrackedRow = {
    id: 2, jobTitle: 'Analyst', companyName: 'Beta',
    stateUserId: null, priority: null, interviewStage: null,
    hasApplied: null, dateApplied: null, heardBack: null, isHidden: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    resolveUserAs(1)
    vi.mocked(withUser).mockImplementation(async (_id, fn) => {
      let call = 0
      const tx = {
        select: vi.fn(() => {
          call++
          return makeChain(call === 1 ? [{ total: 2 }] : [trackedRow, untrackedRow])
        }),
      }
      return fn(tx as never)
    })
  })

  it('a tracked row carries every flattened field with the state value', async () => {
    const { GET } = await import('@/app/api/jobs/route')
    const res = await GET(new NextRequest('http://localhost/api/jobs?scope=catalog'))
    const [row] = (await res.json()).jobs

    expect(row).toMatchObject({
      isTracked: true,
      isHidden: false,
      priority: 4,
      interviewStage: 'phone_screen',
      hasApplied: true,
      dateApplied: '2026-01-05',
      heardBack: true,
    })
  })

  it('an untracked catalog row nulls the flattened fields and reports isTracked:false', async () => {
    const { GET } = await import('@/app/api/jobs/route')
    const res = await GET(new NextRequest('http://localhost/api/jobs?scope=catalog'))
    const row = (await res.json()).jobs[1]

    expect(row).toMatchObject({
      isTracked: false,
      // isHidden is coerced from a missed join, never left null.
      isHidden: false,
      priority: null,
      interviewStage: null,
      hasApplied: null,
      dateApplied: null,
      heardBack: null,
    })
    // Catalog facts still present on an untracked row.
    expect(row).toHaveProperty('jobTitle', 'Analyst')
  })

  it('list rows do NOT carry the nested userState (detail-only contract)', async () => {
    const { GET } = await import('@/app/api/jobs/route')
    const res = await GET(new NextRequest('http://localhost/api/jobs?scope=catalog'))
    for (const row of (await res.json()).jobs) {
      expect(row).not.toHaveProperty('userState')
      expect(row).not.toHaveProperty('stateUserId')
    }
  })
})

// ───────────────────────────────────────────────────────────────────────────────
// §3 — GET /api/jobs/[id] flattened ⇄ userState invariant
// ───────────────────────────────────────────────────────────────────────────────

describe('matrix §3 — GET /api/jobs/[id] flattened fields mirror userState', () => {
  const catalogFacts = { id: 1, jobTitle: 'Engineer', companyId: 5, companyName: 'Acme' }
  const stateRow = {
    priority: 2,
    isHidden: true,
    hasApplied: true,
    dateApplied: '2026-02-01',
    heardBack: true,
    interviewStage: 'onsite',
    referral: true,
    coverLetterSubmitted: true,
    resumeVersionId: null,
    rejectionReason: 'timing',
    notes: 'private notes',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
  }

  // The detail route's reads, in call order: job → state → (skills, software, keywords,
  // certifications, contacts) → optional resume.
  function setupDetail(state: unknown[]) {
    vi.mocked(withUser).mockImplementation(async (_id, fn) => {
      let call = 0
      const tx = {
        select: vi.fn(() => {
          call++
          if (call === 1) return makeChain([catalogFacts])
          if (call === 2) return makeChain(state)
          return makeChain([])
        }),
      }
      return fn(tx as never)
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    resolveUserAs(1)
  })

  it('every flattened field equals its userState counterpart when tracked', async () => {
    setupDetail([stateRow])
    const { GET } = await import('@/app/api/jobs/[id]/route')
    const res = await GET(
      new NextRequest('http://localhost/api/jobs/1', { headers: { authorization: 'Bearer t' } }),
      makeParams('1'),
    )
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(json.userState).toMatchObject(stateRow)
    for (const field of [
      'priority', 'interviewStage', 'hasApplied', 'dateApplied', 'heardBack',
      'referral', 'coverLetterSubmitted', 'rejectionReason', 'notes',
    ] as const) {
      expect(json[field]).toEqual(json.userState[field])
    }
    expect(json).toMatchObject({ isTracked: true, isHidden: true })
  })

  it('untracked defaults are null for values and false for booleans', async () => {
    setupDetail([])
    const { GET } = await import('@/app/api/jobs/[id]/route')
    const res = await GET(
      new NextRequest('http://localhost/api/jobs/1', { headers: { authorization: 'Bearer t' } }),
      makeParams('1'),
    )
    const json = await res.json()

    expect(json).toMatchObject({
      userState: null,
      isTracked: false,
      isHidden: false,
      priority: null,
      interviewStage: null,
      rejectionReason: null,
      notes: null,
      hasApplied: false,
      heardBack: false,
      referral: false,
      coverLetterSubmitted: false,
    })
    expect(json.selectedResume).toBeNull()
  })
})
