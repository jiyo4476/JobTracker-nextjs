import { describe, it, expect, vi, beforeEach } from 'vitest'

// The liveness probe must answer with no credentials and touch no dependencies.
// Nothing here mocks auth: if the route ever grows an auth gate these tests fail, which
// is the point — the deploy probe carries no token and a 401 breaks every deployment.
//
// `@/db` is mocked purely so that *any* database use becomes observable. The route must
// never call it; asserting that is a contract test, not an implementation detail.
vi.mock('@/db', () => ({
  db: {
    execute: vi.fn(),
    select: vi.fn(),
    transaction: vi.fn(),
  },
}))

import { GET } from '@/app/api/health/live/route'
import { db } from '@/db'

describe('GET /api/health/live', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 with status ok', async () => {
    const res = await GET()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ status: 'ok' })
  })

  it('answers without any Authorization header, cookie, or same-origin hint', async () => {
    // Regression guard for the deploy failure this split exists to fix: the probe ran
    // against /api/stats, which API-013 made owner-scoped, so it returned 401 and the
    // readiness loop exhausted its attempts.
    const res = await GET()

    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
  })

  it('never touches the database, so it cannot disclose dependency state unauthenticated', async () => {
    await GET()

    expect(db.execute).not.toHaveBeenCalled()
    expect(db.select).not.toHaveBeenCalled()
    expect(db.transaction).not.toHaveBeenCalled()
  })

  it('stays 200 even when the database would fail, because it does not consult it', async () => {
    vi.mocked(db.execute).mockRejectedValue(new Error('connection refused'))

    const res = await GET()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ status: 'ok' })
  })

  it('is never cached, so a stale ok cannot mask a dead container', async () => {
    const res = await GET()

    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('discloses nothing beyond the status string', async () => {
    const res = await GET()

    expect(Object.keys((await res.json()) as object)).toEqual(['status'])
  })
})
