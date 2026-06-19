import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({
  requireApiKey: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: { select: vi.fn() },
}))

vi.mock('@/db/schema', () => ({
  jobs: {},
  companies: {},
}))

import { requireApiKey } from '@/lib/auth'
import { db } from '@/db'

function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {}
  const terminal = Promise.resolve(result)
  const methods = ['from', 'leftJoin', 'where', 'orderBy', 'limit']
  methods.forEach(m => { chain[m] = vi.fn(() => chain) })
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
    vi.mocked(requireApiKey).mockReturnValue(false)
    const { GET } = await import('@/app/api/export/route')
    const req = new NextRequest('http://localhost/api/export')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns 200 JSON array by default', async () => {
    vi.mocked(requireApiKey).mockReturnValue(true)
    const { GET } = await import('@/app/api/export/route')
    const req = new NextRequest('http://localhost/api/export')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json)).toBe(true)
  })

  it('returns CSV with text/csv content-type when ?format=csv', async () => {
    vi.mocked(requireApiKey).mockReturnValue(true)
    const { GET } = await import('@/app/api/export/route')
    const req = new NextRequest('http://localhost/api/export?format=csv')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/csv')
  })

  it('CSV response has a headers row', async () => {
    vi.mocked(requireApiKey).mockReturnValue(true)
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
    vi.mocked(requireApiKey).mockReturnValue(true)
    const { GET } = await import('@/app/api/export/route')
    const req = new NextRequest('http://localhost/api/export?format=csv')
    const res = await GET(req)
    expect(res.headers.get('Content-Disposition')).toContain('attachment')
  })
})
