import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/users', () => ({
  resolveUser: vi.fn(),
}))

// Partially mock @/lib/auth: keep the real AuthenticationError, mock requireUser.
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>()
  return { ...actual, requireUser: vi.fn() }
})

import { requireUser, AuthenticationError } from '@/lib/auth'
import { resolveUser } from '@/lib/users'
import { requireResolvedUser, resolveRequestUser } from '@/lib/resolved-user'

const req = () => new NextRequest('http://localhost/api/jobs')

const principal = {
  kind: 'user' as const,
  issuer: 'https://issuer/',
  subject: 'sub-123',
  scopes: [],
  method: 'bearer' as const,
  identityKey: 'https://issuer/#sub-123',
  correlationId: 'corr-1',
}

beforeEach(() => vi.clearAllMocks())

describe('requireResolvedUser', () => {
  it('returns the internal id and principal for an active user', async () => {
    vi.mocked(requireUser).mockResolvedValue(principal)
    vi.mocked(resolveUser).mockResolvedValue({
      id: 7, issuer: principal.issuer, subject: principal.subject,
      email: null, displayName: null, isActive: true,
    })

    const user = await requireResolvedUser(req())
    expect(user.id).toBe(7)
    expect(user.principal.correlationId).toBe('corr-1')
    // Identity is taken from the verified principal, never from the request.
    expect(vi.mocked(resolveUser).mock.calls[0][0]).toMatchObject({
      issuer: principal.issuer, subject: principal.subject,
    })
  })

  it('throws inactive_user for a deactivated account (fails closed)', async () => {
    vi.mocked(requireUser).mockResolvedValue(principal)
    vi.mocked(resolveUser).mockResolvedValue({
      id: 7, issuer: principal.issuer, subject: principal.subject,
      email: null, displayName: null, isActive: false,
    })

    await expect(requireResolvedUser(req())).rejects.toMatchObject({ code: 'inactive_user' })
  })

  it('propagates requireUser rejection (service principals never reach here)', async () => {
    vi.mocked(requireUser).mockRejectedValue(new AuthenticationError('wrong_principal', 'corr-x'))
    await expect(requireResolvedUser(req())).rejects.toMatchObject({ code: 'wrong_principal' })
    expect(resolveUser).not.toHaveBeenCalled()
  })
})

describe('resolveRequestUser (route guard)', () => {
  it('maps unauthenticated/wrong_principal to 401', async () => {
    vi.mocked(requireUser).mockRejectedValue(new AuthenticationError('unauthenticated', 'c'))
    const result = await resolveRequestUser(req())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
  })

  it('maps an inactive user to 403', async () => {
    vi.mocked(requireUser).mockResolvedValue(principal)
    vi.mocked(resolveUser).mockResolvedValue({
      id: 7, issuer: principal.issuer, subject: principal.subject,
      email: null, displayName: null, isActive: false,
    })
    const result = await resolveRequestUser(req())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(403)
  })

  it('returns the user on success', async () => {
    vi.mocked(requireUser).mockResolvedValue(principal)
    vi.mocked(resolveUser).mockResolvedValue({
      id: 9, issuer: principal.issuer, subject: principal.subject,
      email: null, displayName: null, isActive: true,
    })
    const result = await resolveRequestUser(req())
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.user.id).toBe(9)
  })
})
