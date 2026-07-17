import { describe, it, expect, vi, beforeEach } from 'vitest'
import { manualJobSchema, companyPatchSchema } from '@/lib/schemas'

// ─── manualJobSchema ──────────────────────────────────────────────────────────

describe('manualJobSchema', () => {
  it('passes with just job_title', () => {
    expect(manualJobSchema.safeParse({ job_title: 'Engineer' }).success).toBe(true)
  })

  it('passes with all optional fields filled', () => {
    const result = manualJobSchema.safeParse({
      job_title: 'Engineer',
      job_link: 'https://example.com/job',
      job_location: 'New York',
      is_remote: true,
      company_id: 42,
      notes: 'Some notes',
      job_type: 'full_time',
      experience_level: 'mid',
      priority: 3,
    })
    expect(result.success).toBe(true)
  })

  it('fails when job_title is missing', () => {
    expect(manualJobSchema.safeParse({}).success).toBe(false)
  })

  it('fails when job_title is whitespace-only', () => {
    expect(manualJobSchema.safeParse({ job_title: '   ' }).success).toBe(false)
  })

  it('trims surrounding whitespace from job_title', () => {
    const result = manualJobSchema.safeParse({ job_title: '  Engineer  ' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.job_title).toBe('Engineer')
  })

  it('fails when job_link is not a valid URL', () => {
    expect(manualJobSchema.safeParse({ job_title: 'Engineer', job_link: 'not-a-url' }).success).toBe(false)
  })

  it('fails when priority is 0 (below min)', () => {
    expect(manualJobSchema.safeParse({ job_title: 'Engineer', priority: 0 }).success).toBe(false)
  })

  it('fails when priority is 6 (above max)', () => {
    expect(manualJobSchema.safeParse({ job_title: 'Engineer', priority: 6 }).success).toBe(false)
  })

  it('fails when job_type is an invalid enum value', () => {
    expect(manualJobSchema.safeParse({ job_title: 'Engineer', job_type: 'gig' }).success).toBe(false)
  })

  it('rejects unknown keys (strict mode)', () => {
    expect(manualJobSchema.safeParse({ job_title: 'Engineer', unknown_field: 'foo' }).success).toBe(false)
  })
})

// ─── companyPatchSchema ───────────────────────────────────────────────────────

describe('companyPatchSchema', () => {
  it('passes with an empty object', () => {
    expect(companyPatchSchema.safeParse({}).success).toBe(true)
  })

  it('passes with valid partial fields', () => {
    expect(companyPatchSchema.safeParse({
      name: 'Acme Corp',
      website: 'https://acme.com',
    }).success).toBe(true)
  })

  it('fails when website is not a valid URL', () => {
    expect(companyPatchSchema.safeParse({ website: 'not-a-url' }).success).toBe(false)
  })

  it('fails when glassdoor_url is not a valid URL', () => {
    expect(companyPatchSchema.safeParse({ glassdoor_url: 'not-a-url' }).success).toBe(false)
  })

  it('accepts a nullable company size bucket and rejects unknown buckets', () => {
    expect(companyPatchSchema.safeParse({ size_range: '51-200' }).success).toBe(true)
    expect(companyPatchSchema.safeParse({ size_range: null }).success).toBe(true)
    expect(companyPatchSchema.safeParse({ size_range: '500+' }).success).toBe(false)
  })
})

// ─── api client (src/lib/api.ts) ──────────────────────────────────────────────

describe('api client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  function mockFetch(ok: boolean, data: unknown) {
    return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok,
      json: () => Promise.resolve(data),
      status: ok ? 200 : 500,
    } as Response)
  }

  it('api.get calls fetch with GET and returns parsed JSON', async () => {
    const spy = mockFetch(true, { hello: 'world' })
    const { api } = await import('@/lib/api')
    const result = await api.get('/test')
    expect(spy).toHaveBeenCalledWith('/api/test', expect.objectContaining({ headers: expect.any(Object) }))
    expect(result).toEqual({ hello: 'world' })
  })

  it('api.post calls fetch with POST and JSON body', async () => {
    const spy = mockFetch(true, { id: 1 })
    const { api } = await import('@/lib/api')
    await api.post('/test', { name: 'foo' })
    expect(spy).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'foo' }) }),
    )
  })

  it('api.patch calls fetch with PATCH and JSON body', async () => {
    const spy = mockFetch(true, { success: true })
    const { api } = await import('@/lib/api')
    await api.patch('/test/1', { field: 'value' })
    expect(spy).toHaveBeenCalledWith(
      '/api/test/1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ field: 'value' }) }),
    )
  })

  it('api.delete calls fetch with DELETE', async () => {
    const spy = mockFetch(true, { success: true })
    const { api } = await import('@/lib/api')
    await api.delete('/test/1')
    expect(spy).toHaveBeenCalledWith(
      '/api/test/1',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('throws when response is not ok', async () => {
    mockFetch(false, { error: 'bad' })
    const { api } = await import('@/lib/api')
    await expect(api.get('/fail')).rejects.toThrow('API error')
  })
})
