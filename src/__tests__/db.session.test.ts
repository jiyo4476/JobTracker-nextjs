import { beforeEach, describe, it, expect, vi } from 'vitest'

// session.ts imports the db client at module load; mock it so no connection is made.
vi.mock('@/db', () => ({
  db: { transaction: vi.fn() },
}))

import { db } from '@/db'
import { setUserContext, withUser } from '@/db/session'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('setUserContext', () => {
  it('issues a transaction-local set_config for app.user_id', async () => {
    const execute = vi.fn().mockResolvedValue(undefined)
    await setUserContext({ execute }, 42)

    expect(execute).toHaveBeenCalledTimes(1)
    // The query is a drizzle SQL object; render its parameters to confirm the GUC name,
    // the string-coerced id, and the is_local=true flag are what the RLS policy expects.
    const query = execute.mock.calls[0][0] as { queryChunks?: unknown[] }
    const flat = JSON.stringify(query)
    expect(flat).toContain('app.user_id')
    expect(flat).toContain('42') // coerced to text for the GUC value
  })

  it('rejects a non-positive or non-integer userId (fails closed)', async () => {
    const execute = vi.fn()
    await expect(setUserContext({ execute }, 0)).rejects.toThrow(/invalid userId/)
    await expect(setUserContext({ execute }, -3)).rejects.toThrow(/invalid userId/)
    await expect(setUserContext({ execute }, 1.5)).rejects.toThrow(/invalid userId/)
    expect(execute).not.toHaveBeenCalled()
  })
})

describe('withUser', () => {
  it('sets context before running the callback and returns its result', async () => {
    const events: string[] = []
    const tx = {
      execute: vi.fn(async () => {
        events.push('context')
      }),
    }
    const transaction = vi.mocked(db.transaction)
    transaction.mockImplementation(async (callback) => callback(tx as never))
    const fn = vi.fn(async (receivedTx: unknown) => {
      events.push('callback')
      expect(receivedTx).toBe(tx)
      return 'ok'
    })

    await expect(withUser(42, fn)).resolves.toBe('ok')

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(typeof transaction.mock.calls[0][0]).toBe('function')
    expect(tx.execute).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(events).toEqual(['context', 'callback'])
  })

  it('propagates errors thrown by the callback', async () => {
    const tx = { execute: vi.fn().mockResolvedValue(undefined) }
    vi.mocked(db.transaction).mockImplementation(async (callback) => callback(tx as never))
    const error = new Error('boom')

    await expect(withUser(42, async () => { throw error })).rejects.toBe(error)
  })
})
