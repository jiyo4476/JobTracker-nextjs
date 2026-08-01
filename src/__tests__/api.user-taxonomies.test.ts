import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ requireAuthentication: vi.fn() }))
vi.mock('@/db', () => ({
  db: {
    execute: vi.fn(),
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
}))

import { db } from '@/db'
import { requireAuthentication } from '@/lib/auth'
import { profileCreateSchemas, profilePatchSchemas } from '@/lib/user-taxonomy-profile'

type MockDb = Record<
  'execute' | 'select' | 'insert' | 'update' | 'delete' | 'transaction',
  ReturnType<typeof vi.fn>
>
const mockDb = db as unknown as MockDb

function chain(result: unknown) {
  const value: Record<string, unknown> = {}
  const terminal = Promise.resolve(result)
  for (const method of [
    'from', 'innerJoin', 'where', 'orderBy', 'limit', 'values', 'set',
    'onConflictDoNothing', 'returning',
  ]) {
    value[method] = vi.fn(() => value)
  }
  value.then = terminal.then.bind(terminal)
  value.catch = terminal.catch.bind(terminal)
  return value
}

function context(category: string): { params: Promise<{ category: string }> }
function context(category: string, id: string): { params: Promise<{ category: string; id: string }> }
function context(category: string, id?: string) {
  return { params: Promise.resolve(id === undefined ? { category } : { category, id }) }
}

function request(path: string, method = 'GET', body?: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe('user taxonomy profile schemas', () => {
  it('requires exactly one category-owned target and rejects a caller-selected user', () => {
    expect(profileCreateSchemas.skills.safeParse({ taxonomy_id: 1, name: 'Python' }).success).toBe(false)
    expect(profileCreateSchemas.skills.safeParse({ name: 'Python', user_id: 'other' }).success).toBe(false)
    expect(profileCreateSchemas.skills.safeParse({ name: '  Python  ' }).data).toMatchObject({
      name: 'Python',
      has_skill: true,
    })
  })

  it('validates category-specific metadata and clear semantics', () => {
    expect(profileCreateSchemas.software.safeParse({ name: 'Docker', familiarity: 'expert' }).success).toBe(true)
    expect(profileCreateSchemas.certifications.safeParse({
      name: 'CISSP',
      earned_date: '2026-02-30',
    }).success).toBe(false)
    expect(profileCreateSchemas.certifications.safeParse({
      name: 'CISSP',
      earned_date: '2026-02-01',
      expires_at: '2026-01-31',
    }).success).toBe(false)
    expect(profilePatchSchemas.certifications.safeParse({ credential_url: null }).success).toBe(true)
    expect(profilePatchSchemas.keywords.safeParse({ preference: 'blocked' }).success).toBe(false)
  })
})

describe('GET and POST /api/user-taxonomies/[category]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    mockDb.transaction.mockImplementation((callback) => callback(mockDb))
  })

  it('authenticates profile reads', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(false)
    const { GET } = await import('@/app/api/user-taxonomies/[category]/route')
    const response = await GET(request('/api/user-taxonomies/skills'), context('skills'))
    expect(response.status).toBe(401)
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it('lists one category in a stable response envelope', async () => {
    const items = [{ taxonomyId: 4, name: 'Docker', familiarity: 'proficient' }]
    mockDb.select.mockReturnValue(chain(items))
    const { GET } = await import('@/app/api/user-taxonomies/[category]/route')
    const response = await GET(request('/api/user-taxonomies/software'), context('software'))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ category: 'software', items })
  })

  it('authenticates profile writes', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(false)
    const { POST } = await import('@/app/api/user-taxonomies/[category]/route')
    const response = await POST(
      request('/api/user-taxonomies/skills', 'POST', { taxonomy_id: 1 }),
      context('skills'),
    )
    expect(response.status).toBe(401)
    expect(mockDb.execute).not.toHaveBeenCalled()
  })

  it('rejects unknown categories before touching the database', async () => {
    const { GET } = await import('@/app/api/user-taxonomies/[category]/route')
    const response = await GET(request('/api/user-taxonomies/tags'), context('tags'))
    expect(response.status).toBe(400)
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it('returns 404 when an ID belongs to no value in the requested category', async () => {
    mockDb.execute.mockResolvedValue([])
    const { POST } = await import('@/app/api/user-taxonomies/[category]/route')
    const response = await POST(
      request('/api/user-taxonomies/certifications', 'POST', { taxonomy_id: 999 }),
      context('certifications'),
    )
    expect(response.status).toBe(404)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it('adds a certification with metadata', async () => {
    mockDb.execute.mockResolvedValueOnce([]).mockResolvedValueOnce([{ taxonomyId: 7, name: 'CISSP' }])
    mockDb.insert.mockReturnValue(chain([{ certificationId: 7 }]))
    mockDb.select.mockReturnValue(chain([{
      taxonomyId: 7,
      name: 'CISSP',
      issuer: 'ISC2',
      earnedDate: '2026-01-01',
      expiresAt: null,
      credentialUrl: null,
    }]))
    const { POST } = await import('@/app/api/user-taxonomies/[category]/route')
    const response = await POST(request('/api/user-taxonomies/certifications', 'POST', {
      name: 'CISSP',
      issuer: 'ISC2',
      earned_date: '2026-01-01',
    }), context('certifications'))
    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({
      category: 'certifications',
      created: true,
      item: { taxonomyId: 7, issuer: 'ISC2' },
    })
  })

  it('treats case-insensitive duplicates as idempotent', async () => {
    mockDb.execute.mockResolvedValueOnce([]).mockResolvedValueOnce([{ taxonomyId: 3, name: 'Python' }])
    mockDb.insert.mockReturnValue(chain([]))
    mockDb.select.mockReturnValue(chain([{ taxonomyId: 3, name: 'Python', hasSkill: true }]))
    const { POST } = await import('@/app/api/user-taxonomies/[category]/route')
    const response = await POST(
      request('/api/user-taxonomies/skills', 'POST', { name: 'python' }),
      context('skills'),
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ created: false, item: { name: 'Python' } })
    expect(mockDb.execute).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['skills', { name: 'Go', has_skill: false }, { taxonomyId: 11, name: 'Go', hasSkill: false }],
    ['software', { name: 'Jira', familiarity: 'familiar' }, { taxonomyId: 11, name: 'Jira', familiarity: 'familiar' }],
    ['keywords', { name: 'remote', preference: 'exclusion' }, { taxonomyId: 11, name: 'remote', preference: 'exclusion' }],
  ] as const)('creates a new %s catalog value and association', async (category, body, item) => {
    mockDb.execute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ taxonomyId: 11, name: item.name }])
    mockDb.insert.mockReturnValue(chain([{ id: 11 }]))
    mockDb.select.mockReturnValue(chain([item]))
    const { POST } = await import('@/app/api/user-taxonomies/[category]/route')
    const response = await POST(
      request(`/api/user-taxonomies/${category}`, 'POST', body),
      context(category),
    )
    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({ category, created: true, item })
  })

  it('rejects malformed JSON and cross-user fields', async () => {
    const { POST } = await import('@/app/api/user-taxonomies/[category]/route')
    const malformed = new NextRequest('http://localhost/api/user-taxonomies/keywords', {
      method: 'POST',
      body: '{',
      headers: { 'content-type': 'application/json' },
    })
    expect((await POST(malformed, context('keywords'))).status).toBe(400)
    expect((await POST(
      request('/api/user-taxonomies/keywords', 'POST', {
        name: 'remote', preference: 'interest', user_id: 'other-user',
      }),
      context('keywords'),
    )).status).toBe(400)
  })
})

describe('PATCH and DELETE /api/user-taxonomies/[category]/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuthentication).mockResolvedValue(true)
  })

  it('rejects malformed IDs', async () => {
    const { DELETE } = await import('@/app/api/user-taxonomies/[category]/[id]/route')
    const response = await DELETE(
      request('/api/user-taxonomies/software/1oops', 'DELETE'),
      context('software', '1oops'),
    )
    expect(response.status).toBe(400)
    expect(mockDb.delete).not.toHaveBeenCalled()
  })

  it('authenticates updates and removals', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(false)
    const { PATCH, DELETE } = await import('@/app/api/user-taxonomies/[category]/[id]/route')
    expect((await PATCH(
      request('/api/user-taxonomies/skills/1', 'PATCH', { has_skill: true }),
      context('skills', '1'),
    )).status).toBe(401)
    expect((await DELETE(
      request('/api/user-taxonomies/skills/1', 'DELETE'),
      context('skills', '1'),
    )).status).toBe(401)
  })

  it('rejects unsupported fields and missing associations before update', async () => {
    const { PATCH } = await import('@/app/api/user-taxonomies/[category]/[id]/route')
    expect((await PATCH(
      request('/api/user-taxonomies/software/3', 'PATCH', { preference: 'interest' }),
      context('software', '3'),
    )).status).toBe(400)
    mockDb.select.mockReturnValue(chain([]))
    expect((await PATCH(
      request('/api/user-taxonomies/skills/3', 'PATCH', { has_skill: true }),
      context('skills', '3'),
    )).status).toBe(404)
  })

  it('prevents certification date inversions across partial updates', async () => {
    mockDb.select.mockReturnValue(chain([{
      taxonomyId: 8,
      name: 'Security+',
      issuer: null,
      earnedDate: '2026-06-01',
      expiresAt: '2027-06-01',
      credentialUrl: null,
    }]))
    const { PATCH } = await import('@/app/api/user-taxonomies/[category]/[id]/route')
    const response = await PATCH(
      request('/api/user-taxonomies/certifications/8', 'PATCH', { expires_at: '2026-05-31' }),
      context('certifications', '8'),
    )
    expect(response.status).toBe(400)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it('updates a keyword preference and returns the updated item', async () => {
    mockDb.select
      .mockReturnValueOnce(chain([{ taxonomyId: 9, name: 'onsite', preference: 'interest' }]))
      .mockReturnValueOnce(chain([{ taxonomyId: 9, name: 'onsite', preference: 'exclusion' }]))
    mockDb.update.mockReturnValue(chain(undefined))
    const { PATCH } = await import('@/app/api/user-taxonomies/[category]/[id]/route')
    const response = await PATCH(
      request('/api/user-taxonomies/keywords/9', 'PATCH', { preference: 'exclusion' }),
      context('keywords', '9'),
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      category: 'keywords', item: { preference: 'exclusion' },
    })
  })

  it.each([
    ['skills', { has_skill: true }, { taxonomyId: 2, name: 'Python', hasSkill: true }],
    ['software', { familiarity: null }, { taxonomyId: 2, name: 'Docker', familiarity: null }],
    ['certifications', { issuer: null }, {
      taxonomyId: 2,
      name: 'CISSP',
      issuer: null,
      earnedDate: null,
      expiresAt: null,
      credentialUrl: null,
    }],
  ] as const)('updates %s association metadata', async (category, body, item) => {
    mockDb.select.mockReturnValueOnce(chain([item])).mockReturnValueOnce(chain([item]))
    mockDb.update.mockReturnValue(chain(undefined))
    const { PATCH } = await import('@/app/api/user-taxonomies/[category]/[id]/route')
    const response = await PATCH(
      request(`/api/user-taxonomies/${category}/2`, 'PATCH', body),
      context(category, '2'),
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ category, item })
  })

  it('returns 404 for an association not owned by the profile', async () => {
    mockDb.delete.mockReturnValue(chain([]))
    const { DELETE } = await import('@/app/api/user-taxonomies/[category]/[id]/route')
    const response = await DELETE(
      request('/api/user-taxonomies/software/42', 'DELETE'),
      context('software', '42'),
    )
    expect(response.status).toBe(404)
  })

  it('deletes only the selected category association', async () => {
    mockDb.delete.mockReturnValue(chain([{ softwareId: 42 }]))
    const { DELETE } = await import('@/app/api/user-taxonomies/[category]/[id]/route')
    const response = await DELETE(
      request('/api/user-taxonomies/software/42', 'DELETE'),
      context('software', '42'),
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      category: 'software', taxonomyId: 42, success: true,
    })
  })

  it.each(['skills', 'certifications', 'keywords'] as const)(
    'uses the %s-owned association when deleting',
    async (category) => {
      mockDb.delete.mockReturnValue(chain([{ id: 6 }]))
      const { DELETE } = await import('@/app/api/user-taxonomies/[category]/[id]/route')
      const response = await DELETE(
        request(`/api/user-taxonomies/${category}/6`, 'DELETE'),
        context(category, '6'),
      )
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toMatchObject({ category, taxonomyId: 6, success: true })
    },
  )
})

describe('GET /api/user-taxonomies/[category]/gap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuthentication).mockResolvedValue(true)
  })

  it('returns taxonomy-scoped counts and preference-aware match states', async () => {
    mockDb.execute
      .mockResolvedValueOnce([{ profile: 3, demanded: 7, matched: 2, excluded: 1, gaps: 4 }])
      .mockResolvedValueOnce([{
        taxonomyId: 5,
        name: 'onsite',
        jobCount: 10,
        profileStatus: 'exclusion',
        matchState: 'excluded',
      }])
    const { GET } = await import('@/app/api/user-taxonomies/[category]/gap/route')
    const response = await GET(
      request('/api/user-taxonomies/keywords/gap?limit=5'),
      context('keywords'),
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      category: 'keywords',
      counts: { profile: 3, demanded: 7, matched: 2, excluded: 1, gaps: 4 },
      items: [{
        taxonomyId: 5,
        name: 'onsite',
        jobCount: 10,
        profileStatus: 'exclusion',
        matchState: 'excluded',
      }],
      page: 1,
      totalPages: 2,
    })
  })

  it('authenticates gap reads and validates pagination before querying', async () => {
    const { GET } = await import('@/app/api/user-taxonomies/[category]/gap/route')
    vi.mocked(requireAuthentication).mockResolvedValue(false)
    expect((await GET(request('/api/user-taxonomies/skills/gap'), context('skills'))).status).toBe(401)
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    expect((await GET(
      request('/api/user-taxonomies/skills/gap?limit=101'),
      context('skills'),
    )).status).toBe(400)
    expect(mockDb.execute).not.toHaveBeenCalled()
  })

  it('rejects an invalid category and oversized search query', async () => {
    const { GET } = await import('@/app/api/user-taxonomies/[category]/gap/route')
    expect((await GET(request('/api/user-taxonomies/tags/gap'), context('tags'))).status).toBe(400)
    expect((await GET(
      request(`/api/user-taxonomies/skills/gap?q=${'a'.repeat(101)}`),
      context('skills'),
    )).status).toBe(400)
    expect(mockDb.execute).not.toHaveBeenCalled()
  })
})
