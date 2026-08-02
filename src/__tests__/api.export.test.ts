import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({
  requireAuthentication: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: { select: vi.fn() },
}))

// Use the real Drizzle schema so the WHERE clause renders to SQL and the
// soft-delete filter can be asserted on.
vi.mock('@/db/schema', async importOriginal => importOriginal())

import { requireAuthentication } from '@/lib/auth'
import { db } from '@/db'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

// Captures the condition passed to `.where()` so tests can render it to SQL.
const captured: { where?: SQL } = {}

function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {}
  const terminal = Promise.resolve(result)
  chain.from = vi.fn(() => chain)
  chain.leftJoin = vi.fn(() => chain)
  chain.where = vi.fn((condition: SQL) => { captured.where = condition; return chain })
  chain.orderBy = vi.fn(() => chain)
  chain.limit = vi.fn(() => chain)
  chain.then = terminal.then.bind(terminal)
  chain.catch = terminal.catch.bind(terminal)
  return chain
}

const mockRows = [
  {
    id: 1, jobTitle: 'Engineer', companyName: 'Acme', jobLink: 'https://x.com',
    jobLocation: 'NYC', isRemote: true, sourcePlatform: 'linkedin', jobType: 'full_time',
    experienceLevel: 'mid', salaryMin: 100000, salaryMax: 150000, salaryText: '$100k-$150k',
    hasApplied: false, dateApplied: null, interviewStage: 'not_applied',
    datePosted: '2024-01-01', dateFound: '2024-01-02', isActive: true, priority: 3, notes: null,
  },
]

describe('GET /api/export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.select.mockReturnValue(makeChain(mockRows))
  })

  it('returns 401 without auth', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(false)
    const { GET } = await import('@/app/api/export/route')
    const req = new NextRequest('http://localhost/api/export')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns 200 JSON array by default', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    const { GET } = await import('@/app/api/export/route')
    const req = new NextRequest('http://localhost/api/export')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json)).toBe(true)
  })

  it('returns CSV with text/csv content-type when ?format=csv', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    const { GET } = await import('@/app/api/export/route')
    const req = new NextRequest('http://localhost/api/export?format=csv')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/csv')
  })

  it('CSV response has a headers row', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    const { GET } = await import('@/app/api/export/route')
    const req = new NextRequest('http://localhost/api/export?format=csv')
    const res = await GET(req)
    const text = await res.text()
    const firstLine = text.split('\n')[0]
    expect(firstLine).toContain('id')
    expect(firstLine).toContain('jobTitle')
    expect(firstLine).toContain('companyName')
  })

  it('CSV has Content-Disposition attachment header', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    const { GET } = await import('@/app/api/export/route')
    const req = new NextRequest('http://localhost/api/export?format=csv')
    const res = await GET(req)
    expect(res.headers.get('Content-Disposition')).toContain('attachment')
  })

  it('JSON response includes X-Export-Limit header set to 10000', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    const { GET } = await import('@/app/api/export/route')
    const req = new NextRequest('http://localhost/api/export')
    const res = await GET(req)
    expect(res.headers.get('X-Export-Limit')).toBe('10000')
  })

  it('CSV response includes X-Export-Limit header set to 10000', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    const { GET } = await import('@/app/api/export/route')
    const req = new NextRequest('http://localhost/api/export?format=csv')
    const res = await GET(req)
    expect(res.headers.get('X-Export-Limit')).toBe('10000')
  })

  it('excludes soft-deleted jobs (is_active + deleted_at filter)', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    const { GET } = await import('@/app/api/export/route')
    const req = new NextRequest('http://localhost/api/export')
    await GET(req)
    expect(captured.where).toBeDefined()
    const { sql: rendered } = new PgDialect().sqlToQuery(captured.where!)
    expect(rendered).toMatch(/"jobs"\."is_active"\s*=\s*\$\d+/i)
    expect(rendered).toMatch(/"jobs"\."deleted_at"\s+is\s+null/i)
  })

  it('returns 400 for an unsupported format', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    const { GET } = await import('@/app/api/export/route')
    const res = await GET(new NextRequest('http://localhost/api/export?format=xml'))
    expect(res.status).toBe(400)
    expect(await res.json()).toHaveProperty('error')
  })

  it('accepts the explicit json format', async () => {
    vi.mocked(requireAuthentication).mockResolvedValue(true)
    const { GET } = await import('@/app/api/export/route')
    const res = await GET(new NextRequest('http://localhost/api/export?format=json'))
    expect(res.status).toBe(200)
    expect(Array.isArray(await res.json())).toBe(true)
  })
})
