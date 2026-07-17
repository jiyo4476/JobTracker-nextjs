import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({
  requireApiKey: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
}))

import { requireApiKey } from '@/lib/auth'
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

describe('PATCH /api/jobs/[id]/salary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('returns 401 without auth', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(false)
    const { PATCH } = await import('@/app/api/jobs/[id]/salary/route')
    const res = await PATCH(makeReq('/api/jobs/1/salary', {}), makeParams('1'))
    expect(res.status).toBe(401)
  })

  it('rejects invalid min/max ranges', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const { PATCH } = await import('@/app/api/jobs/[id]/salary/route')
    const res = await PATCH(
      makeReq('/api/jobs/1/salary', { salary_type: 'annual', salary_min: 120000, salary_max: 80000 }),
      makeParams('1')
    )
    expect(res.status).toBe(400)
  })

  it('rejects hourly rates with more than two decimal places', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const { PATCH } = await import('@/app/api/jobs/[id]/salary/route')
    const res = await PATCH(
      makeReq('/api/jobs/1/salary', { hourly_rate_min: 50.999, hourly_rate_max: 60 }),
      makeParams('1')
    )
    expect(res.status).toBe(400)
  })

  it('rejects hourly rates high enough to overflow the annual-equivalent cents column', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const { PATCH } = await import('@/app/api/jobs/[id]/salary/route')
    const res = await PATCH(
      makeReq('/api/jobs/1/salary', { hourly_rate_min: 15000, hourly_rate_max: 20000 }),
      makeParams('1')
    )
    expect(res.status).toBe(400)
  })

  it('rejects changing salary type without the matching range', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const { PATCH } = await import('@/app/api/jobs/[id]/salary/route')
    const res = await PATCH(
      makeReq('/api/jobs/1/salary', { salary_type: 'hourly' }),
      makeParams('1')
    )
    expect(res.status).toBe(400)
  })

  it('rejects switching to annual when salary_max is explicitly nulled instead of set', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const { PATCH } = await import('@/app/api/jobs/[id]/salary/route')
    const res = await PATCH(
      makeReq('/api/jobs/1/salary', { salary_type: 'annual', salary_min: 8000000, salary_max: null }),
      makeParams('1')
    )
    expect(res.status).toBe(400)
  })

  it('rejects a half-open range (salary_min set, salary_max null) even without an explicit salary_type', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const { PATCH } = await import('@/app/api/jobs/[id]/salary/route')
    const res = await PATCH(
      makeReq('/api/jobs/1/salary', { salary_min: 8000000, salary_max: null }),
      makeParams('1')
    )
    expect(res.status).toBe(400)
  })

  it('rejects salary_currency codes that are not 3 uppercase letters', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const { PATCH } = await import('@/app/api/jobs/[id]/salary/route')
    for (const salary_currency of ['us', 'USD1', 'usd']) {
      const res = await PATCH(
        makeReq('/api/jobs/1/salary', { salary_currency }),
        makeParams('1')
      )
      expect(res.status).toBe(400)
    }
  })

  it('rejects a partial annual range with only salary_min provided', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const { PATCH } = await import('@/app/api/jobs/[id]/salary/route')
    const res = await PATCH(
      makeReq('/api/jobs/1/salary', { salary_min: 8000000 }),
      makeParams('1')
    )
    expect(res.status).toBe(400)
  })

  it('rejects dual annual + hourly ranges when salary_type is omitted', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const { PATCH } = await import('@/app/api/jobs/[id]/salary/route')
    const res = await PATCH(
      makeReq('/api/jobs/1/salary', {
        salary_min: 8000000,
        salary_max: 12000000,
        hourly_rate_min: 50,
        hourly_rate_max: 60,
      }),
      makeParams('1')
    )
    expect(res.status).toBe(400)
  })

  it('persists annual salary values as cents directly, matching PATCH /api/jobs/[id]', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    const updateChain = makeChain([{ id: 1, salaryMin: 8000000, salaryMax: 12000000 }])
    mockDb.update.mockReturnValue(updateChain)

    const { PATCH } = await import('@/app/api/jobs/[id]/salary/route')
    const res = await PATCH(
      makeReq('/api/jobs/1/salary', {
        salary_type: 'annual',
        salary_min: 8000000,
        salary_max: 12000000,
        salary_currency: 'USD',
      }),
      makeParams('1')
    )

    expect(res.status).toBe(200)
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        salaryType: 'annual',
        salaryMin: 8000000,
        salaryMax: 12000000,
        hourlyRateMin: null,
        hourlyRateMax: null,
        annualEquivalentMin: 8000000,
        annualEquivalentMax: 12000000,
      })
    )
  })

  it('infers annual salary type from an annual range', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    const updateChain = makeChain([{ id: 1, salaryMin: 9000000, salaryMax: 12000000 }])
    mockDb.update.mockReturnValue(updateChain)

    const { PATCH } = await import('@/app/api/jobs/[id]/salary/route')
    const res = await PATCH(
      makeReq('/api/jobs/1/salary', {
        salary_min: 9000000,
        salary_max: 12000000,
        salary_currency: 'USD',
      }),
      makeParams('1')
    )

    expect(res.status).toBe(200)
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        salaryMin: 9000000,
        salaryMax: 12000000,
        salaryType: 'annual',
        hourlyRateMin: null,
        hourlyRateMax: null,
        annualEquivalentMin: 9000000,
        annualEquivalentMax: 12000000,
      })
    )
  })

  it('infers hourly salary type and clears annual values from an hourly range', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    const updateChain = makeChain([{ id: 1, salaryType: 'hourly' }])
    mockDb.update.mockReturnValue(updateChain)

    const { PATCH } = await import('@/app/api/jobs/[id]/salary/route')
    const res = await PATCH(
      makeReq('/api/jobs/1/salary', { hourly_rate_min: 50.15, hourly_rate_max: 60.25 }),
      makeParams('1')
    )

    expect(res.status).toBe(200)
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        salaryType: 'hourly',
        salaryMin: null,
        salaryMax: null,
        hourlyRateMin: '50.15',
        hourlyRateMax: '60.25',
        annualEquivalentMin: 10431200,
        annualEquivalentMax: 12532000,
      })
    )
  })

  it('allows clearing salary values', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    const updateChain = makeChain([{ id: 1, salaryMin: null, salaryMax: null }])
    mockDb.update.mockReturnValue(updateChain)

    const { PATCH } = await import('@/app/api/jobs/[id]/salary/route')
    const res = await PATCH(
      makeReq('/api/jobs/1/salary', {
        salary_type: null,
        salary_min: null,
        salary_max: null,
        salary_text: null,
      }),
      makeParams('1')
    )

    expect(res.status).toBe(200)
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        salaryType: null,
        salaryMin: null,
        salaryMax: null,
        annualEquivalentMin: null,
        annualEquivalentMax: null,
        salaryText: null,
      })
    )
  })
})

describe('PATCH /api/jobs/[id]/tags', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('creates unknown tag names before linking them to the job', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.insert.mockReturnValue(makeChain([]))
    mockDb.select
      .mockReturnValueOnce(makeChain([{ id: 1 }]))
      .mockReturnValueOnce(makeChain([{ id: 10, name: 'Python' }, { id: 11, name: 'Missing Skill' }]))
      .mockReturnValueOnce(makeChain([{ id: 10, name: 'Python' }, { id: 11, name: 'Missing Skill' }]))
      .mockReturnValueOnce(makeChain([]))
      .mockReturnValueOnce(makeChain([]))
      .mockReturnValueOnce(makeChain([]))
    const tx = {
      delete: vi.fn(() => makeChain([])),
      insert: vi.fn(() => makeChain([])),
      update: vi.fn(() => makeChain([])),
    }
    mockDb.transaction.mockImplementation(async (callback: (value: typeof tx) => Promise<void>) => callback(tx))

    const { PATCH } = await import('@/app/api/jobs/[id]/tags/route')
    const res = await PATCH(
      makeReq('/api/jobs/1/tags', { skills: ['Python', 'Missing Skill'] }),
      makeParams('1')
    )

    expect(res.status).toBe(200)
    expect(mockDb.insert.mock.results[0].value.values).toHaveBeenCalledWith([
      { name: 'Python' },
      { name: 'Missing Skill' },
    ])
    expect(mockDb.insert.mock.results[0].value.onConflictDoNothing).toHaveBeenCalled()
  })

  it('rejects a payload with no tag arrays', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const { PATCH } = await import('@/app/api/jobs/[id]/tags/route')
    const res = await PATCH(makeReq('/api/jobs/1/tags', {}), makeParams('1'))
    expect(res.status).toBe(400)
  })

  it('rejects empty or whitespace-only tag names', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const { PATCH } = await import('@/app/api/jobs/[id]/tags/route')
    const res = await PATCH(
      makeReq('/api/jobs/1/tags', { skills: ['   '] }),
      makeParams('1')
    )
    expect(res.status).toBe(400)
  })

  it('de-duplicates repeated tag names before validating and persisting', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.insert.mockReturnValue(makeChain([]))
    mockDb.select
      .mockReturnValueOnce(makeChain([{ id: 1 }]))
      .mockReturnValueOnce(makeChain([{ id: 10, name: 'Python' }]))
      .mockReturnValueOnce(makeChain([{ id: 10, name: 'Python' }]))
      .mockReturnValueOnce(makeChain([]))
      .mockReturnValueOnce(makeChain([]))
      .mockReturnValueOnce(makeChain([]))
    const tx = {
      delete: vi.fn(() => makeChain([])),
      insert: vi.fn(() => makeChain([])),
      update: vi.fn(() => makeChain([])),
    }
    mockDb.transaction.mockImplementation(async (callback: (value: typeof tx) => Promise<void>) => callback(tx))

    const { PATCH } = await import('@/app/api/jobs/[id]/tags/route')
    const res = await PATCH(makeReq('/api/jobs/1/tags', { skills: ['Python', 'Python'] }), makeParams('1'))

    expect(res.status).toBe(200)
    expect(tx.insert).toHaveBeenCalledTimes(1)
    expect(tx.insert.mock.results[0].value.values).toHaveBeenCalledWith([{ jobId: 1, skillId: 10 }])
  })

  it('replaces provided tag groups and returns counts', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.insert.mockReturnValue(makeChain([]))
    mockDb.select
      .mockReturnValueOnce(makeChain([{ id: 1 }]))
      .mockReturnValueOnce(makeChain([{ id: 10, name: 'Python' }]))
      .mockReturnValueOnce(makeChain([{ id: 10, name: 'Python' }]))
      .mockReturnValueOnce(makeChain([]))
      .mockReturnValueOnce(makeChain([]))
      .mockReturnValueOnce(makeChain([]))
    const tx = {
      delete: vi.fn(() => makeChain([])),
      insert: vi.fn(() => makeChain([])),
      update: vi.fn(() => makeChain([])),
    }
    mockDb.transaction.mockImplementation(async (callback: (value: typeof tx) => Promise<void>) => callback(tx))

    const { PATCH } = await import('@/app/api/jobs/[id]/tags/route')
    const res = await PATCH(makeReq('/api/jobs/1/tags', { skills: ['Python'] }), makeParams('1'))

    expect(res.status).toBe(200)
    expect(mockDb.transaction).toHaveBeenCalled()
    expect(tx.delete).toHaveBeenCalled()
    expect(tx.insert).toHaveBeenCalled()
    const json = await res.json()
    expect(json.counts.skills).toBe(1)
  })
})

describe('GET /api/tags', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('accepts singular tag type aliases', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.select.mockReturnValue(makeChain([{ id: 1, name: 'TypeScript' }]))

    const { GET } = await import('@/app/api/tags/route')
    const res = await GET(new NextRequest('http://localhost/api/tags?type=skill&q=type'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{ id: 1, name: 'TypeScript' }])
  })

  it('rejects invalid tag types', async () => {
    const { GET } = await import('@/app/api/tags/route')
    const res = await GET(new NextRequest('http://localhost/api/tags?type=bad'))
    expect(res.status).toBe(400)
  })

  it('caps results at 20 via .limit(20)', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    const chain = makeChain([{ id: 1, name: 'TypeScript' }])
    mockDb.select.mockReturnValue(chain)

    const { GET } = await import('@/app/api/tags/route')
    const res = await GET(new NextRequest('http://localhost/api/tags?type=skills&q=script'))

    expect(res.status).toBe(200)
    expect(chain.limit).toHaveBeenCalledWith(20)
  })

  it('resolves selected names by IDs beyond the first lookup page', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    const chain = makeChain([{ id: 99, name: 'Zymurgy' }])
    mockDb.select.mockReturnValue(chain)

    const { GET } = await import('@/app/api/tags/route')
    const res = await GET(new NextRequest('http://localhost/api/tags?type=skills&ids=99,4,99'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{ id: 99, name: 'Zymurgy' }])
    expect(chain.limit).toHaveBeenCalledWith(2)
  })

  it.each(['abc', '0', '-1'])('rejects invalid selected ID input %j', async ids => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    const { GET } = await import('@/app/api/tags/route')
    const res = await GET(new NextRequest(`http://localhost/api/tags?type=skills&ids=${ids}`))

    expect(res.status).toBe(400)
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it('rejects more than 100 selected IDs before querying', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    const ids = Array.from({ length: 101 }, (_, index) => index + 1).join(',')
    const { GET } = await import('@/app/api/tags/route')
    const res = await GET(new NextRequest(`http://localhost/api/tags?type=skills&ids=${ids}`))

    expect(res.status).toBe(400)
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it('does not throw on query strings containing ilike wildcard characters', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.select.mockReturnValue(makeChain([]))

    const { GET } = await import('@/app/api/tags/route')
    const res = await GET(new NextRequest(`http://localhost/api/tags?type=skills&q=${encodeURIComponent('100%_c\\')}`))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('returns 500 instead of throwing when the DB query fails', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.select.mockImplementationOnce(() => {
      throw new Error('connection lost')
    })

    const { GET } = await import('@/app/api/tags/route')
    const res = await GET(new NextRequest('http://localhost/api/tags?type=skills&q=script'))

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Internal server error' })
  })
})
