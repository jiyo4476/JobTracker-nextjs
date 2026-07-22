import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock auth
vi.mock('@/lib/auth', () => ({
  requireAuthentication: vi.fn(),
}))

// Mock nlp-extract
vi.mock('@/lib/nlp-extract', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/nlp-extract')>()
  return {
    ...actual,
    extractTags: vi.fn().mockReturnValue({
      skills: ['Python'],
      software: ['Docker', 'GitHub'],
      keywords: ['remote'],
      certifications: ['CISSP'],
    }),
  }
})

// Mock db
vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}))

// Schema is NOT mocked: the fuzzy-dedup tests render the real Drizzle columns
// to SQL to verify the COALESCE(date_posted, date_found) window.

import { requireAuthentication } from '@/lib/auth'
import { db } from '@/db'
import { extractTags } from '@/lib/nlp-extract'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

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

function makeInsertMock(opts: { returning?: unknown[]; withConflictUpdate?: boolean }) {
  const valuesChain: Record<string, unknown> = {
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    onConflictDoUpdate: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(opts.returning ?? []),
    }),
    returning: vi.fn().mockResolvedValue(opts.returning ?? []),
  }
  return {
    values: vi.fn().mockReturnValue(valuesChain),
  }
}

function setupDbMocks(scenario: 'created' | 'updated' | 'duplicate') {
  const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>

  mockDb.update = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  })

  if (scenario === 'updated') {
    let insertCallCount = 0
    mockDb.insert.mockImplementation(() => {
      insertCallCount++
      // first insert = company upsert
      if (insertCallCount === 1) {
        return makeInsertMock({ returning: [{ id: 1 }], withConflictUpdate: true })
      }
      return makeInsertMock({ returning: [{ id: 99 }] })
    })

    let selectCallCount = 0
    mockDb.select.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => {
            selectCallCount++
            // exact match query returns a hit
            if (selectCallCount === 1) return Promise.resolve([{ id: 99 }])
            return Promise.resolve([])
          }),
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    }))
  } else if (scenario === 'duplicate') {
    let insertCallCount = 0
    mockDb.insert.mockImplementation(() => {
      insertCallCount++
      if (insertCallCount === 1) return makeInsertMock({ returning: [{ id: 1 }], withConflictUpdate: true })
      return makeInsertMock({ returning: [] })
    })

    let selectCallCount = 0
    mockDb.select.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => {
            selectCallCount++
            if (selectCallCount === 1) return Promise.resolve([]) // no exact match
            return Promise.resolve([{ id: 88 }]) // fuzzy match
          }),
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              selectCallCount++
              return Promise.resolve([{ id: 88 }])
            }),
          }),
        }),
      }),
    }))
  } else {
    // created
    let insertCallCount = 0
    mockDb.insert.mockImplementation(() => {
      insertCallCount++
      if (insertCallCount === 1) return makeInsertMock({ returning: [{ id: 1 }], withConflictUpdate: true })
      if (insertCallCount === 2) return makeInsertMock({ returning: [{ id: 42 }] })
      // lookup upserts (skills/software/keywords/certifications) resolve to id 7
      // so the junction inserts fire and can be asserted on
      return makeInsertMock({ returning: [{ id: 7 }] })
    })

    mockDb.select.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    }))
  }
}

const PRIMARY_INSERT_ID = 1
const FUZZY_INSERT_ID = 42

// Like setupDbMocks, but captures the fuzzy-dedup WHERE condition so tests can
// assert on the SQL it generates, and lets the caller control the fuzzy result.
//
// Expected call sequence:
// 1. First INSERT creates or updates the primary lead and returns PRIMARY_INSERT_ID.
// 2. First SELECT checks for an exact URL match and returns no rows.
// 3. Second SELECT checks fuzzy duplicates and returns the caller-provided result.
// 4. Second INSERT creates the new fuzzy-matched lead and returns FUZZY_INSERT_ID.
// 5. Any additional INSERTs return an empty result set.
function setupFuzzyCapture(fuzzyResult: unknown[]) {
  const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
  const captured: { fuzzyWhere?: SQL } = {}

  let insertCallCount = 0
  mockDb.insert.mockImplementation(() => {
    insertCallCount++
    if (insertCallCount === 1) {
      return makeInsertMock({ returning: [{ id: PRIMARY_INSERT_ID }], withConflictUpdate: true })
    }
    if (insertCallCount === 2) {
      return makeInsertMock({ returning: [{ id: FUZZY_INSERT_ID }] })
    }
    return makeInsertMock({ returning: [] })
  })

  let selectCallCount = 0
  mockDb.select.mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockImplementation((condition: SQL) => {
        selectCallCount++
        if (selectCallCount === 1) return { limit: vi.fn().mockResolvedValue([]) } // exact match: none
        captured.fuzzyWhere = condition
        return { limit: vi.fn().mockResolvedValue(fuzzyResult) }
      }),
    }),
  }))

  return captured
}

describe('POST /api/scrape', () => {
  beforeEach(() => {
    delete process.env.CHROME_EXTENSION_ORIGINS
    vi.clearAllMocks()
  })

  it('allows the packaged Chrome extension preflight', async () => {
    const { OPTIONS } = await import('@/app/api/scrape/route')
    const req = new NextRequest('http://jobtracker.local/api/scrape', {
      method: 'OPTIONS',
      headers: {
        origin: 'chrome-extension://nddejaeggmibdiimpjcdechfnckgcmnf',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type',
      },
    })

    const res = OPTIONS(req)

    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'chrome-extension://nddejaeggmibdiimpjcdechfnckgcmnf',
    )
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST')
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Authorization, Content-Type')
  })

  it('rejects preflight requests from origins outside the extension allowlist', async () => {
    const { OPTIONS } = await import('@/app/api/scrape/route')
    const req = new NextRequest('http://jobtracker.local/api/scrape', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://evil.example',
        'access-control-request-method': 'POST',
      },
    })

    const res = OPTIONS(req)

    expect(res.status).toBe(403)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it.each([
    ['an unexpected method', { 'access-control-request-method': 'DELETE' }],
    [
      'an unexpected request header',
      {
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,x-admin-token',
      },
    ],
  ])('rejects extension preflights requesting %s', async (_case, preflightHeaders) => {
    const { OPTIONS } = await import('@/app/api/scrape/route')
    const req = new NextRequest('http://jobtracker.local/api/scrape', {
      method: 'OPTIONS',
      headers: {
        origin: 'chrome-extension://nddejaeggmibdiimpjcdechfnckgcmnf',
        ...preflightHeaders,
      },
    })

    const res = OPTIONS(req)

    expect(res.status).toBe(403)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('adds the extension CORS origin to authenticated POST responses', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    setupDbMocks('created')
    const { POST } = await import('@/app/api/scrape/route')
    const req = makeRequest(validBody)
    req.headers.set('origin', 'chrome-extension://nddejaeggmibdiimpjcdechfnckgcmnf')

    const res = await POST(req)

    expect(res.status).toBe(201)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'chrome-extension://nddejaeggmibdiimpjcdechfnckgcmnf',
    )
  })

  it('does not add CORS headers to authenticated POST responses from unlisted origins', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    setupDbMocks('created')
    const { POST } = await import('@/app/api/scrape/route')
    const req = makeRequest(validBody)
    req.headers.set('origin', 'https://evil.example')

    const res = await POST(req)

    expect(res.status).toBe(201)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('supports an environment-configured extension origin', async () => {
    process.env.CHROME_EXTENSION_ORIGINS = 'chrome-extension://customextensionid'
    const { OPTIONS } = await import('@/app/api/scrape/route')
    const req = new NextRequest('http://jobtracker.local/api/scrape', {
      method: 'OPTIONS',
      headers: {
        origin: 'chrome-extension://customextensionid',
        'access-control-request-method': 'POST',
      },
    })

    const res = OPTIONS(req)

    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'chrome-extension://customextensionid',
    )
  })

  it('returns 401 when requireAuthentication returns false', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(false)
    const { POST } = await import('@/app/api/scrape/route')
    const res = await POST(makeRequest(validBody, false))
    expect(res.status).toBe(401)
  })

  it('calls requireAuthentication with allowSameOrigin: false (external-only endpoint)', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    const { POST } = await import('@/app/api/scrape/route')
    const req = makeRequest(validBody, false)
    await POST(req)
    expect(requireAuthentication).toHaveBeenCalledWith(req, { allowSameOrigin: false })
  })

  it('returns 400 when body is invalid JSON', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
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
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    const { POST } = await import('@/app/api/scrape/route')
    const res = await POST(makeRequest({ job_title: 'Only title, missing rest' }))
    expect(res.status).toBe(400)
  })

  it('returns 201 with action=created on new job insert', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    setupDbMocks('created')
    const { POST } = await import('@/app/api/scrape/route')
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.action).toBe('created')
    expect(json.job_id).toBe(42)
  })

  it('accepts google as a source_platform on new job insert', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    setupDbMocks('created')
    const { POST } = await import('@/app/api/scrape/route')
    const res = await POST(makeRequest({ ...validBody, source_platform: 'google' }))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.action).toBe('created')
  })

  it('returns 200 with action=updated when exact match exists', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    setupDbMocks('updated')
    const { POST } = await import('@/app/api/scrape/route')
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.action).toBe('updated')
  })

  it('attaches merged taxonomy matches when an exact job is updated', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    setupDbMocks('updated')
    const { POST } = await import('@/app/api/scrape/route')

    const res = await POST(makeRequest({
      ...validBody,
      job_description: 'Python and Docker are required. CISSP preferred.',
      skills: ['TypeScript'],
    }))

    expect(res.status).toBe(200)
    const insertedValues = vi.mocked(db.insert).mock.results
      .map(result => result.value.values)
      .flatMap(values => vi.mocked(values).mock.calls)
      .map(([value]) => value)
    // Each taxonomy gets its own caller-first lookup upsert…
    expect(insertedValues).toContainEqual([{ name: 'TypeScript' }, { name: 'Python' }])
    expect(insertedValues).toContainEqual([{ name: 'Docker' }, { name: 'GitHub' }])
    expect(insertedValues).toContainEqual([{ name: 'CISSP' }])
    // …and its own junction insert against the matched job
    expect(insertedValues).toContainEqual([{ jobId: 99, skillId: 99 }])
    expect(insertedValues).toContainEqual([{ jobId: 99, softwareId: 99 }])
    expect(insertedValues).toContainEqual([{ jobId: 99, certificationId: 99 }])
  })

  it('attaches merged taxonomy matches independently when a new job is created', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    setupDbMocks('created')
    const { POST } = await import('@/app/api/scrape/route')

    const res = await POST(makeRequest({
      ...validBody,
      job_description: 'Python and Docker are required. CISSP preferred.',
      skills: ['TypeScript'],
    }))

    expect(res.status).toBe(201)
    const insertedValues = vi.mocked(db.insert).mock.results
      .map(result => result.value.values)
      .flatMap(values => vi.mocked(values).mock.calls)
      .map(([value]) => value)
    expect(insertedValues).toContainEqual([{ name: 'TypeScript' }, { name: 'Python' }])
    expect(insertedValues).toContainEqual([{ name: 'Docker' }, { name: 'GitHub' }])
    expect(insertedValues).toContainEqual([{ name: 'CISSP' }])
    expect(insertedValues).toContainEqual([{ jobId: 42, skillId: 7 }])
    expect(insertedValues).toContainEqual([{ jobId: 42, softwareId: 7 }])
    expect(insertedValues).toContainEqual([{ jobId: 42, certificationId: 7 }])
  })

  it('returns 200 with action=duplicate_skipped when fuzzy match exists', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    setupDbMocks('duplicate')
    const { POST } = await import('@/app/api/scrape/route')
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.action).toBe('duplicate_skipped')
  })

  it('calls extractTags when skills are empty and job_description is present', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    setupDbMocks('created')
    const { POST } = await import('@/app/api/scrape/route')
    const bodyWithDescription = {
      ...validBody,
      job_description: 'We need Python and Docker experience. Remote friendly. GitHub required.',
    }
    const res = await POST(makeRequest(bodyWithDescription))
    expect(res.status).toBe(201)
    expect(vi.mocked(extractTags)).toHaveBeenCalledWith(bodyWithDescription.job_description)
  })

  it('calls extractTags even when keywords are present but skills are empty', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    setupDbMocks('created')
    const { POST } = await import('@/app/api/scrape/route')
    const bodyWithKeywordsOnly = {
      ...validBody,
      job_description: 'Senior backend Python role, remote friendly.',
      keywords: ['remote', 'backend'],
    }
    const res = await POST(makeRequest(bodyWithKeywordsOnly))
    expect(res.status).toBe(201)
    expect(vi.mocked(extractTags)).toHaveBeenCalledWith(bodyWithKeywordsOnly.job_description)
  })

  it('calls extractTags when local taxonomy values are already provided', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    setupDbMocks('created')
    const { POST } = await import('@/app/api/scrape/route')
    const bodyWithSkills = {
      ...validBody,
      job_description: 'We need Python experience.',
      skills: ['TypeScript'],
      software: ['Jira'],
      certifications: ['PMP'],
    }
    const res = await POST(makeRequest(bodyWithSkills))
    expect(res.status).toBe(201)
    expect(vi.mocked(extractTags)).toHaveBeenCalledWith(bodyWithSkills.job_description)
  })

  it('returns 400 when posting_md_path uses uppercase characters', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    const { POST } = await import('@/app/api/scrape/route')
    const res = await POST(makeRequest({ ...validBody, posting_md_path: 'LinkedIn/Job123.MD' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when posting_md_path uses mixed-case extension', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    const { POST } = await import('@/app/api/scrape/route')
    const res = await POST(makeRequest({ ...validBody, posting_md_path: 'linkedin/Job123.Md' }))
    expect(res.status).toBe(400)
  })

  it('accepts a valid lowercase posting_md_path', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    setupDbMocks('created')
    const { POST } = await import('@/app/api/scrape/route')
    const res = await POST(makeRequest({ ...validBody, posting_md_path: 'linkedin/job-123.md' }))
    expect(res.status).toBe(201)
  })

  it('does not call extractTags when description is absent and tag arrays are empty', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    setupDbMocks('created')
    const { POST } = await import('@/app/api/scrape/route')
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(201)
    expect(vi.mocked(extractTags)).not.toHaveBeenCalled()
  })

  it('skips as duplicate when a NULL date_posted row has a recent date_found', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    // The DB matches an undated row whose date_found is inside the 7-day window
    const captured = setupFuzzyCapture([{ id: 88 }])
    const { POST } = await import('@/app/api/scrape/route')
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.action).toBe('duplicate_skipped')
    expect(json.job_id).toBe(88)

    // The window must be COALESCE(date_posted, date_found) >= <7 days ago>, so a
    // NULL date_posted row only matches while its date_found is recent.
    const { sql: rendered, params } = new PgDialect().sqlToQuery(captured.fuzzyWhere!)
    expect(rendered).toMatch(/coalesce\("jobs"\."date_posted",\s*"jobs"\."date_found"\)\s*>=\s*\$\d+/i)
    expect(params.some(p => typeof p === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p))).toBe(true)
  })

  it('creates the job when a NULL date_posted row has an old date_found', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    // An undated row whose date_found fell out of the 7-day window no longer matches
    const captured = setupFuzzyCapture([])
    const { POST } = await import('@/app/api/scrape/route')
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.action).toBe('created')
    expect(json.job_id).toBe(42)

    // Regression guard: no unconditional "date_posted IS NULL" branch, which used
    // to let stale undated rows block new jobs forever.
    const { sql: rendered } = new PgDialect().sqlToQuery(captured.fuzzyWhere!)
    expect(rendered).toMatch(/coalesce/i)
    expect(rendered).not.toMatch(/"date_posted"\s+is\s+null/i)
  })

  it.each(['', '   '])('does not call extractTags when job_description is empty: %j', async jobDescription => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    setupDbMocks('created')
    const { POST } = await import('@/app/api/scrape/route')
    const res = await POST(makeRequest({ ...validBody, job_description: jobDescription, skills: [] }))
    expect(res.status).toBe(201)
    expect(vi.mocked(extractTags)).not.toHaveBeenCalled()
  })
})
