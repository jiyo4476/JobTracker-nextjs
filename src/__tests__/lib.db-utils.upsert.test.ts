import { describe, it, expect, vi } from 'vitest'

vi.mock('@/db', () => ({ db: {} }))
vi.mock('@/db/schema', () => ({
  skills: { id: 'skills.id', name: 'skills.name' },
  software: { id: 'software.id', name: 'software.name' },
  keywords: { id: 'keywords.id', name: 'keywords.name' },
  certifications: { id: 'certifications.id', name: 'certifications.name' },
}))

import { upsertLookupIds } from '@/lib/db-utils'
import { skills } from '@/db/schema'

// Builds an executor mock. `insertReturning` is what the ON CONFLICT DO NOTHING
// RETURNING clause resolves to (the rows actually inserted); `selectRows` is what
// the follow-up "resolve the conflicting names" SELECT resolves to.
function makeExecutor(insertReturning: Array<{ id: number; name: string }>, selectRows: Array<{ id: number }>) {
  const insertValues = vi.fn()
  const selectWhere = vi.fn().mockResolvedValue(selectRows)
  const executor = {
    insert: vi.fn(() => ({
      values: (vals: unknown) => {
        insertValues(vals)
        return {
          onConflictDoNothing: () => ({
            returning: vi.fn().mockResolvedValue(insertReturning),
          }),
        }
      },
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: selectWhere })),
    })),
  }
  return { executor, insertValues, selectWhere }
}

describe('upsertLookupIds', () => {
  it('returns [] and touches nothing for an empty name list', async () => {
    const { executor } = makeExecutor([], [])
    const ids = await upsertLookupIds(executor as never, skills as never, [])
    expect(ids).toEqual([])
    expect(executor.insert).not.toHaveBeenCalled()
    expect(executor.select).not.toHaveBeenCalled()
  })

  it('de-duplicates names before inserting', async () => {
    const { executor, insertValues } = makeExecutor(
      [{ id: 1, name: 'Python' }],
      [],
    )
    await upsertLookupIds(executor as never, skills as never, ['Python', 'Python', 'Python'])
    expect(insertValues).toHaveBeenCalledWith([{ name: 'Python' }])
  })

  it('returns ids for freshly inserted names without a follow-up select', async () => {
    const { executor, selectWhere } = makeExecutor(
      [{ id: 10, name: 'Go' }, { id: 11, name: 'Rust' }],
      [],
    )
    const ids = await upsertLookupIds(executor as never, skills as never, ['Go', 'Rust'])
    expect(ids.sort()).toEqual([10, 11])
    // Every name was inserted, so no conflict-resolution select is issued.
    expect(selectWhere).not.toHaveBeenCalled()
  })

  it('resolves ids for names that already existed via the conflict select', async () => {
    // 'Python' was inserted now; 'Docker' already existed (conflict → not returned)
    // and is resolved by the select.
    const { executor } = makeExecutor(
      [{ id: 1, name: 'Python' }],
      [{ id: 2 }],
    )
    const ids = await upsertLookupIds(executor as never, skills as never, ['Python', 'Docker'])
    expect(ids.sort()).toEqual([1, 2])
  })

  it('falls back entirely to the select when every name already existed (empty RETURNING)', async () => {
    // All names conflict, so ON CONFLICT DO NOTHING RETURNING resolves to [].
    // An empty RETURNING is the normal "nothing new inserted" signal, not an
    // error: every id must come from the follow-up SELECT.
    const { executor, insertValues, selectWhere } = makeExecutor(
      [],
      [{ id: 5 }, { id: 6 }],
    )
    const ids = await upsertLookupIds(executor as never, skills as never, ['Python', 'Docker'])
    expect(ids.sort()).toEqual([5, 6])
    // The insert was still attempted (ON CONFLICT DO NOTHING is a no-op here)...
    expect(insertValues).toHaveBeenCalledWith([{ name: 'Python' }, { name: 'Docker' }])
    // ...and the ids were resolved by the conflict-resolution select.
    expect(selectWhere).toHaveBeenCalledTimes(1)
  })
})
