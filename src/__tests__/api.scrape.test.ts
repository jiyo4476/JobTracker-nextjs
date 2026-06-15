import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock auth
vi.mock('@/lib/auth', () => ({
  requireApiKey: vi.fn(),
}))

// Mock db
vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}))

// Mock schema module (tables)
vi.mock('@/db/schema', () => ({
  companies: {},
  jobs: {},
  skills: {},
  software: {},
  keywords: {},
  certifications: {},
  jobSkills: {},
  jobSoftware: {},
  jobKeywords: {},
  jobCertifications: {},
}))

import { requireApiKey } from '@/lib/auth'
import { db } from '@/db'

const validBody = {
  source_platform: 'linkedin',
  external_job_id: 'ext-001',
  company_name: 'Acme',
  job_title: 'Engineer',
  job_link: 'https://example.com/job/1',
}

function makeRequest(body: unknown, auth = true) {
  const req = new NextRequest('http://localhost/api/scrape', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(auth ? { authorization: 'Bearer test-key' } : {}),
    },
    body: JSON.stringify(body),
  })
  return req
}

function setupDbMocks(scenario: 'created' | 'updated' | 'duplicate') {
  const mockDb = db as Record<string, ReturnType<typeof vi.fn>>

  if (scenario === 'updated') {
    // exact match found
    let selectCallCount = 0
    mockDb.select.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => {
            selectCallCount++
            // first call = company lookup, second = exact match
            if (selectCallCount === 1) return Promise.resolve([{ id: 1 }])
            return Promise.resolve([{ id: 99 }])
          }),
        }),
      }),
    }))
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
        returning: vi.fn().mockResolvedValue([{ id: 99 }]),
      }),
    })
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    })
  } else if (scenario === 'duplicate') {
    let selectCallCount = 0
    mockDb.select.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => {
            selectCallCount++
            if (selectCallCount === 1) return Promise.resolve([{ id: 1 }]) // company
            if (selectCallCount === 2) return Promise.resolve([]) // no exact match
            return Promise.resolve([{ id: 88 }]) // fuzzy match
          }),
        }),
      }),
    }))
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      }),
    })
  } else {
    // created
    let selectCallCount = 0
    mockDb.select.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => {
            selectCallCount++
            if (selectCallCount === 1) return Promise.resolve([{ id: 1 }]) // company
            return Promise.resolve([]) // no matches
          }),
        }),
      }),
    }))
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
        returning: vi.fn().mockResolvedValue([{ id: 42 }]),
      }),
    })
  }
}

describe('POST /api/scrape', () => {
  beforeEach(() => {
    process.env.API_KEY = 'test-key'
    vi.clearAllMocks()
  })

  it('returns 401 when requireApiKey returns false', async () => {
    vi.mocked(requireApiKey).mockReturnValue(false)
    const { POST } = await import('@/app/api/scrape/route')
    const res = await POST(makeRequest(validBody, false))
    expect(res.status).toBe(401)
  })

  it('returns 400 when body is invalid JSON', async () => {
    vi.mocked(requireApiKey).mockReturnValue(true)
    const { POST } = await import('@/app/api/scrape/route')
    const req = new NextRequest('http://localhost/api/scrape', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-key' },
      body: 'not json{{{',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when body fails Zod validation', async () => {
    vi.mocked(requireApiKey).mockReturnValue(true)
    const { POST } = await import('@/app/api/scrape/route')
    const res = await POST(makeRequest({ job_title: 'Only title, missing rest' }))
    expect(res.status).toBe(400)
  })

  it('returns 201 with action=created on new job insert', async () => {
    vi.mocked(requireApiKey).mockReturnValue(true)
    setupDbMocks('created')
    const { POST } = await import('@/app/api/scrape/route')
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.action).toBe('created')
    expect(json.job_id).toBe(42)
  })

  it('returns 200 with action=updated when exact match exists', async () => {
    vi.mocked(requireApiKey).mockReturnValue(true)
    setupDbMocks('updated')
    const { POST } = await import('@/app/api/scrape/route')
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.action).toBe('updated')
  })

  it('returns 200 with action=duplicate_skipped when fuzzy match exists', async () => {
    vi.mocked(requireApiKey).mockReturnValue(true)
    setupDbMocks('duplicate')
    const { POST } = await import('@/app/api/scrape/route')
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.action).toBe('duplicate_skipped')
  })
})
