import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/db', () => ({ db: { select: vi.fn() } }))
vi.mock('@/db/schema', () => ({ jobs: {} }))

import { db } from '@/db'

function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {}
  const terminal = Promise.resolve(result)
  ;['from', 'where', 'limit'].forEach(m => { chain[m] = vi.fn(() => chain) })
  chain.then = terminal.then.bind(terminal)
  chain.catch = terminal.catch.bind(terminal)
  return chain
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('GET /api/jobs/[id]/description', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 for non-numeric id', async () => {
    const { GET } = await import('@/app/api/jobs/[id]/description/route')
    const req = new NextRequest('http://localhost/api/jobs/abc/description')
    const res = await GET(req, makeParams('abc'))
    expect(res.status).toBe(400)
  })

  it('returns 404 when job not found', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.select.mockReturnValue(makeChain([]))
    const { GET } = await import('@/app/api/jobs/[id]/description/route')
    const req = new NextRequest('http://localhost/api/jobs/999/description')
    const res = await GET(req, makeParams('999'))
    expect(res.status).toBe(404)
  })

  it('returns 200 with id and job_description when found', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.select.mockReturnValue(makeChain([{ id: 1, jobDescription: 'A great job' }]))
    const { GET } = await import('@/app/api/jobs/[id]/description/route')
    const req = new NextRequest('http://localhost/api/jobs/1/description')
    const res = await GET(req, makeParams('1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ id: 1, job_description: 'A great job' })
  })
})
