import { describe, it, expect, vi, beforeEach } from 'vitest'

// Real schema (no DB connection); only the db client is mocked.
vi.mock('@/db', () => ({
  db: { insert: vi.fn() },
}))

import { db } from '@/db'
import { resolveUser } from '@/lib/users'

type Chain = {
  values: ReturnType<typeof vi.fn>
  onConflictDoUpdate: ReturnType<typeof vi.fn>
  returning: ReturnType<typeof vi.fn>
}

function mockInsert(result: unknown): { chain: Chain; captured: { values?: unknown; conflict?: unknown } } {
  const captured: { values?: unknown; conflict?: unknown } = {}
  const chain = {} as Chain
  chain.values = vi.fn((v: unknown) => { captured.values = v; return chain })
  chain.onConflictDoUpdate = vi.fn((c: unknown) => { captured.conflict = c; return chain })
  chain.returning = vi.fn(() => Promise.resolve(result))
  vi.mocked(db.insert as unknown as ReturnType<typeof vi.fn>).mockReturnValue(chain)
  return { chain, captured }
}

const ROW = {
  id: 7,
  issuer: 'https://auth.example/application/o/job-tracker/',
  subject: 'sub-abc',
  email: 'a@b.co',
  displayName: 'Ada',
  isActive: true,
}

describe('resolveUser', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the upserted internal user row', async () => {
    mockInsert([ROW])
    const result = await resolveUser({ issuer: ROW.issuer, subject: ROW.subject })
    expect(result).toEqual(ROW)
  })

  it('throws a targeted error when the upsert returns no row', async () => {
    mockInsert([])
    await expect(
      resolveUser({ issuer: ROW.issuer, subject: ROW.subject }),
    ).rejects.toThrow(/upsert returned no row/)
  })

  it('rejects an empty issuer or subject (identity must be non-empty)', async () => {
    await expect(resolveUser({ issuer: '  ', subject: 'x' })).rejects.toThrow(/issuer is required/)
    await expect(resolveUser({ issuer: 'x', subject: '' })).rejects.toThrow(/subject is required/)
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('trims identity and collapses blank metadata to null before insert', async () => {
    const { captured } = mockInsert([ROW])
    await resolveUser({
      issuer: '  https://iss/  ',
      subject: '  sub-1  ',
      email: '   ',
      displayName: '  Grace  ',
    })
    expect(captured.values).toMatchObject({
      issuer: 'https://iss/',
      subject: 'sub-1',
      email: null,
      displayName: 'Grace',
    })
  })

  it('conflicts on (issuer, subject) and never reactivates via the update set', async () => {
    const { chain, captured } = mockInsert([ROW])
    await resolveUser({ issuer: ROW.issuer, subject: ROW.subject, email: 'new@x.co' })
    expect(chain.onConflictDoUpdate).toHaveBeenCalledTimes(1)
    const conflict = captured.conflict as { target: unknown[]; set: Record<string, unknown> }
    expect(conflict.target).toHaveLength(2)
    // is_active must NOT be in the update set — deactivation must fail closed on login.
    expect(Object.keys(conflict.set)).not.toContain('isActive')
    expect(conflict.set).toHaveProperty('updatedAt')
  })
})
