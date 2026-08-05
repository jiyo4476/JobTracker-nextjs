import { describe, it, expect, vi, beforeEach } from 'vitest'

// The deploy readiness probe must answer without any credentials. Nothing here mocks
// auth, so if the route ever grows an auth gate these tests fail — which is the point:
// the pipeline's probe has no token, and a 401 here breaks every deployment.
vi.mock('@/db', () => ({
  db: {
    execute: vi.fn(),
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  serializeError: vi.fn((err: unknown) => ({ message: String(err) })),
}))

import { GET } from '@/app/api/health/route'
import { db } from '@/db'
import { logger } from '@/lib/logger'

const execute = vi.mocked(db.execute)

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 with status ok when the database is reachable', async () => {
    execute.mockResolvedValue(undefined as never)

    const res = await GET()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ status: 'ok' })
  })

  it('answers without any Authorization header, cookie, or same-origin hint', async () => {
    // Regression guard for the deploy failure this endpoint exists to fix: the probe
    // ran against /api/stats, which API-013 made owner-scoped, so it returned 401 and
    // the readiness loop exhausted its attempts.
    execute.mockResolvedValue(undefined as never)

    const res = await GET()

    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
  })

  it('actually round-trips to the database rather than reporting ok blindly', async () => {
    execute.mockResolvedValue(undefined as never)

    await GET()

    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('returns 503 when the database is unreachable', async () => {
    execute.mockRejectedValue(new Error('connection refused'))

    const res = await GET()

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({ status: 'degraded' })
  })

  it('never leaks the database error text to the caller, but does log it', async () => {
    execute.mockRejectedValue(new Error('password authentication failed for user "postgres"'))

    const res = await GET()
    const body = JSON.stringify(await res.json())

    expect(body).not.toContain('password')
    expect(body).not.toContain('postgres')
    expect(logger.error).toHaveBeenCalledOnce()
  })

  it('is never cached, so a stale ok cannot mask a failing container', async () => {
    execute.mockResolvedValue(undefined as never)

    const ok = await GET()
    expect(ok.headers.get('cache-control')).toBe('no-store')

    execute.mockRejectedValue(new Error('down'))
    const degraded = await GET()
    expect(degraded.headers.get('cache-control')).toBe('no-store')
  })
})
