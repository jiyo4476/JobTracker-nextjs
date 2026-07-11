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
  const methods = ['from', 'innerJoin', 'where', 'orderBy', 'limit', 'set', 'values', 'returning']
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

  it('rejects changing salary type without the matching range', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const { PATCH } = await import('@/app/api/jobs/[id]/salary/route')
    const res = await PATCH(
      makeReq('/api/jobs/1/salary', { salary_type: 'hourly' }),
      makeParams('1')
    )
    expect(res.status).toBe(400)
  })

  it('converts annual dollar values to persisted cents', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    const updateChain = makeChain([{ id: 1, salaryMin: 8000000, salaryMax: 12000000 }])
    mockDb.update.mockReturnValue(updateChain)

    const { PATCH } = await import('@/app/api/jobs/[id]/salary/route')
    const res = await PATCH(
      makeReq('/api/jobs/1/salary', {
        salary_type: 'annual',
        salary_min: 80000,
        salary_max: 120000,
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
        salary_min: 90000,
        salary_max: 120000,
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

  it('rejects unknown tag names', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.select
      .mockReturnValueOnce(makeChain([{ id: 1 }]))
      .mockReturnValueOnce(makeChain([{ id: 10, name: 'Python' }]))

    const { PATCH } = await import('@/app/api/jobs/[id]/tags/route')
    const res = await PATCH(
      makeReq('/api/jobs/1/tags', { skills: ['Python', 'Missing Skill'] }),
      makeParams('1')
    )

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.invalid.skills).toEqual(['Missing Skill'])
  })

  it('replaces provided tag groups and returns counts', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(true)
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
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
})
