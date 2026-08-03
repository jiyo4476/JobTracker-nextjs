import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

vi.mock('@/lib/resolved-user', () => ({
  resolveRequestUser: vi.fn(),
}))

vi.mock('@/db/session', () => ({
  withUser: vi.fn(),
}))

import { resolveRequestUser } from '@/lib/resolved-user'
import { withUser } from '@/db/session'

const captured: { where?: SQL } = {}

function renderParams(query: unknown): unknown[] {
  return new PgDialect().sqlToQuery(query as SQL).params
}

function resolveAs(userId: number) {
  vi.mocked(resolveRequestUser).mockResolvedValue({
    ok: true,
    user: { id: userId, issuer: 'https://issuer/', subject: `sub-${userId}`, principal: {} as never },
  })
}
function resolveDenied() {
  vi.mocked(resolveRequestUser).mockResolvedValue({
    ok: false,
    response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  })
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

function setupTx(rows: unknown[] = mockRows) {
  vi.mocked(withUser).mockImplementation(async (_id, fn) => {
    const tx = {
      select: vi.fn(() => {
        const chain: Record<string, unknown> = {}
        const terminal = Promise.resolve(rows)
        chain.from = vi.fn(() => chain)
        chain.innerJoin = vi.fn(() => chain)
        chain.leftJoin = vi.fn(() => chain)
        chain.where = vi.fn((condition: SQL) => { captured.where = condition; return chain })
        chain.orderBy = vi.fn(() => chain)
        chain.limit = vi.fn(() => chain)
        chain.then = terminal.then.bind(terminal)
        chain.catch = terminal.catch.bind(terminal)
        chain.finally = terminal.finally.bind(terminal)
        return chain
      }),
    }
    return fn(tx as never)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  captured.where = undefined
  resolveAs(1)
  setupTx()
})

describe('GET /api/export', () => {
  it('returns 401 when the user cannot be resolved', async () => {
    resolveDenied()
    const { GET } = await import('@/app/api/export/route')
    const res = await GET(new NextRequest('http://localhost/api/export'))
    expect(res.status).toBe(401)
  })

  it('returns 200 JSON array by default', async () => {
    const { GET } = await import('@/app/api/export/route')
    const res = await GET(new NextRequest('http://localhost/api/export'))
    expect(res.status).toBe(200)
    expect(Array.isArray(await res.json())).toBe(true)
  })

  it('returns CSV with text/csv content-type when ?format=csv', async () => {
    const { GET } = await import('@/app/api/export/route')
    const res = await GET(new NextRequest('http://localhost/api/export?format=csv'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/csv')
  })

  it('CSV response has a headers row', async () => {
    const { GET } = await import('@/app/api/export/route')
    const res = await GET(new NextRequest('http://localhost/api/export?format=csv'))
    const firstLine = (await res.text()).split('\n')[0]
    expect(firstLine).toContain('id')
    expect(firstLine).toContain('jobTitle')
    expect(firstLine).toContain('companyName')
  })

  it('CSV has Content-Disposition attachment header', async () => {
    const { GET } = await import('@/app/api/export/route')
    const res = await GET(new NextRequest('http://localhost/api/export?format=csv'))
    expect(res.headers.get('Content-Disposition')).toContain('attachment')
  })

  it('neutralizes spreadsheet formula injection in CSV cells', async () => {
    setupTx([{ ...mockRows[0], notes: '=cmd(),calc', jobTitle: '+SUM(A1)' }])
    const { GET } = await import('@/app/api/export/route')
    const res = await GET(new NextRequest('http://localhost/api/export?format=csv'))
    const text = await res.text()
    // Leading formula characters are prefixed with a single quote; the comma in notes
    // also triggers CSV quoting.
    expect(text).toContain(`"'=cmd(),calc"`)
    expect(text).toContain(`'+SUM(A1)`)
  })

  it('JSON response is private/no-store and carries the export limit', async () => {
    const { GET } = await import('@/app/api/export/route')
    const res = await GET(new NextRequest('http://localhost/api/export'))
    expect(res.headers.get('X-Export-Limit')).toBe('10000')
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('CSV response is private/no-store and carries the export limit', async () => {
    const { GET } = await import('@/app/api/export/route')
    const res = await GET(new NextRequest('http://localhost/api/export?format=csv'))
    expect(res.headers.get('X-Export-Limit')).toBe('10000')
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('exports only the caller state: owner predicate + active/non-hidden filter', async () => {
    resolveAs(2)
    const { GET } = await import('@/app/api/export/route')
    await GET(new NextRequest('http://localhost/api/export'))
    expect(captured.where).toBeDefined()
    const { sql: rendered, params } = new PgDialect().sqlToQuery(captured.where!)
    expect(rendered).toMatch(/"user_job_state"\."user_id"\s*=\s*\$\d+/i)
    expect(rendered).toMatch(/"jobs"\."is_active"\s*=\s*\$\d+/i)
    expect(rendered).toMatch(/"jobs"\."deleted_at"\s+is\s+null/i)
    // The bound owner id is the caller (2), never another user.
    expect(params).toContain(2)
    expect(renderParams(captured.where)).not.toContain(1)
  })

  it('returns 400 for an unsupported format', async () => {
    const { GET } = await import('@/app/api/export/route')
    const res = await GET(new NextRequest('http://localhost/api/export?format=xml'))
    expect(res.status).toBe(400)
    expect(await res.json()).toHaveProperty('error')
  })

  it('accepts the explicit json format', async () => {
    const { GET } = await import('@/app/api/export/route')
    const res = await GET(new NextRequest('http://localhost/api/export?format=json'))
    expect(res.status).toBe(200)
    expect(Array.isArray(await res.json())).toBe(true)
  })
})
