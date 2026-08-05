import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// The readiness probe is authenticated on purpose: whether the database is reachable is
// operational detail and must not be readable from the public domain. These tests drive
// the real `requireAuth` boundary only through its verification seam, so the gate itself
// (including allowSameOrigin: false) is exercised rather than stubbed away.
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>()
  return { ...actual, requireAuthentication: vi.fn() }
})

vi.mock('@/db', () => ({
  db: { execute: vi.fn() },
}))

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  serializeError: vi.fn((err: unknown) => ({ message: String(err) })),
}))

import { GET } from '@/app/api/health/ready/route'
import { requireAuthentication } from '@/lib/auth'
import { db } from '@/db'
import { logger } from '@/lib/logger'

const authenticate = vi.mocked(requireAuthentication)
const execute = vi.mocked(db.execute)

function makeRequest() {
  return new NextRequest('http://jobtracker.local/api/health/ready')
}

describe('GET /api/health/ready', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 without valid credentials', async () => {
    authenticate.mockResolvedValue(false)

    const res = await GET(makeRequest())

    expect(res.status).toBe(401)
  })

  it('does not touch the database when the caller is unauthenticated', async () => {
    // Ordering matters: an unauthenticated caller must not be able to drive database
    // load, and must not learn dependency state from a timing difference.
    authenticate.mockResolvedValue(false)

    await GET(makeRequest())

    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects the forgeable same-origin fallback', async () => {
    // Any non-browser client can set a matching Origin header, so an ops endpoint must
    // require a real verified token rather than accepting the same-origin path.
    authenticate.mockResolvedValue(true)
    execute.mockResolvedValue(undefined as never)

    await GET(makeRequest())

    expect(authenticate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ allowSameOrigin: false }),
    )
  })

  it('returns 200 with status ok when authenticated and the database answers', async () => {
    authenticate.mockResolvedValue(true)
    execute.mockResolvedValue(undefined as never)

    const res = await GET(makeRequest())

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ status: 'ok' })
  })

  it('actually round-trips to the database rather than reporting ok blindly', async () => {
    authenticate.mockResolvedValue(true)
    execute.mockResolvedValue(undefined as never)

    await GET(makeRequest())

    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('returns 503 when the database is unreachable', async () => {
    authenticate.mockResolvedValue(true)
    execute.mockRejectedValue(new Error('connection refused'))

    const res = await GET(makeRequest())

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({ status: 'degraded' })
  })

  it('never leaks the database error text to the caller, but does log it', async () => {
    authenticate.mockResolvedValue(true)
    execute.mockRejectedValue(
      new Error('password authentication failed for user "postgres" at 172.28.0.2'),
    )

    const res = await GET(makeRequest())
    const body = JSON.stringify(await res.json())

    expect(body).not.toContain('password')
    expect(body).not.toContain('postgres')
    expect(body).not.toContain('172.28.0.2')
    expect(logger.error).toHaveBeenCalledOnce()
  })

  it('is never cached, so a stale ok cannot mask a failing dependency', async () => {
    authenticate.mockResolvedValue(true)

    execute.mockResolvedValue(undefined as never)
    expect((await GET(makeRequest())).headers.get('cache-control')).toBe('no-store')

    execute.mockRejectedValue(new Error('down'))
    expect((await GET(makeRequest())).headers.get('cache-control')).toBe('no-store')
  })
})
