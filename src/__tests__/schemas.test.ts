import { describe, it, expect } from 'vitest'
import { scrapePayloadSchema, jobPatchSchema } from '@/lib/schemas'

const validPayload = {
  source_platform: 'linkedin',
  external_job_id: 'ext-123',
  company_name: 'Acme Corp',
  job_title: 'Software Engineer',
  job_link: 'https://example.com/job/123',
}

describe('scrapePayloadSchema', () => {
  it('passes with a valid payload', () => {
    const result = scrapePayloadSchema.safeParse(validPayload)
    expect(result.success).toBe(true)
  })

  it('applies defaults: is_remote=false, security_clearance_req=false, arrays empty', () => {
    const result = scrapePayloadSchema.safeParse(validPayload)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.is_remote).toBe(false)
      expect(result.data.security_clearance_req).toBe(false)
      expect(result.data.skills).toEqual([])
      expect(result.data.software).toEqual([])
      expect(result.data.keywords).toEqual([])
      expect(result.data.certifications).toEqual([])
    }
  })

  it('fails when source_platform is missing', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { source_platform: _sp, ...rest } = validPayload
    expect(scrapePayloadSchema.safeParse(rest).success).toBe(false)
  })

  it('fails when external_job_id is missing', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { external_job_id: _eid, ...rest } = validPayload
    expect(scrapePayloadSchema.safeParse(rest).success).toBe(false)
  })

  it('fails when company_name is missing', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { company_name: _cn, ...rest } = validPayload
    expect(scrapePayloadSchema.safeParse(rest).success).toBe(false)
  })

  it('fails when job_title is missing', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { job_title: _jt, ...rest } = validPayload
    expect(scrapePayloadSchema.safeParse(rest).success).toBe(false)
  })

  it('fails when job_link is missing', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { job_link: _jl, ...rest } = validPayload
    expect(scrapePayloadSchema.safeParse(rest).success).toBe(false)
  })

  it('fails when job_link is not a valid URL', () => {
    expect(scrapePayloadSchema.safeParse({ ...validPayload, job_link: 'not-a-url' }).success).toBe(false)
  })

  it('fails with an invalid source_platform enum value', () => {
    expect(scrapePayloadSchema.safeParse({ ...validPayload, source_platform: 'twitter' }).success).toBe(false)
  })

  it('accepts google as a valid source_platform', () => {
    expect(scrapePayloadSchema.safeParse({ ...validPayload, source_platform: 'google' }).success).toBe(true)
  })

  it('fails with an invalid job_type enum value', () => {
    expect(scrapePayloadSchema.safeParse({ ...validPayload, job_type: 'gig' }).success).toBe(false)
  })

  it('accepts a valid posting_md_path', () => {
    expect(scrapePayloadSchema.safeParse({ ...validPayload, posting_md_path: 'linkedin/123456.md' }).success).toBe(true)
  })

  it('accepts posting_md_path being absent (optional)', () => {
    const result = scrapePayloadSchema.safeParse(validPayload)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.posting_md_path).toBeUndefined()
  })

  it('rejects posting_md_path with path traversal', () => {
    expect(scrapePayloadSchema.safeParse({ ...validPayload, posting_md_path: '../etc/passwd' }).success).toBe(false)
    expect(scrapePayloadSchema.safeParse({ ...validPayload, posting_md_path: 'linkedin/../secret.md' }).success).toBe(false)
  })

  it('accepts a valid ISO date_posted', () => {
    const result = scrapePayloadSchema.safeParse({ ...validPayload, date_posted: '2026-07-08' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.date_posted).toBe('2026-07-08')
  })

  it('rejects a malformed date_posted', () => {
    expect(scrapePayloadSchema.safeParse({ ...validPayload, date_posted: '3 days ago' }).success).toBe(false)
    expect(scrapePayloadSchema.safeParse({ ...validPayload, date_posted: '07/08/2026' }).success).toBe(false)
    expect(scrapePayloadSchema.safeParse({ ...validPayload, date_posted: '2026-7-8' }).success).toBe(false)
    expect(scrapePayloadSchema.safeParse({ ...validPayload, date_posted: '' }).success).toBe(false)
  })

  it('accepts date_posted being absent (optional)', () => {
    const result = scrapePayloadSchema.safeParse(validPayload)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.date_posted).toBeUndefined()
  })

  it('rejects posting_md_path that does not match platform/job_id.md format', () => {
    expect(scrapePayloadSchema.safeParse({ ...validPayload, posting_md_path: 'no-slash.md' }).success).toBe(false)
    expect(scrapePayloadSchema.safeParse({ ...validPayload, posting_md_path: 'linkedin/123456.txt' }).success).toBe(false)
    expect(scrapePayloadSchema.safeParse({ ...validPayload, posting_md_path: 'too/many/segments.md' }).success).toBe(false)
  })
})

describe('jobPatchSchema', () => {
  it('passes with an empty object', () => {
    expect(jobPatchSchema.safeParse({}).success).toBe(true)
  })

  it('passes with valid partial fields', () => {
    expect(jobPatchSchema.safeParse({ is_remote: true, priority: 3 }).success).toBe(true)
  })

  it('rejects unknown keys (strict mode)', () => {
    expect(jobPatchSchema.safeParse({ unknown_field: 'foo' }).success).toBe(false)
  })

  it('fails when priority is out of range', () => {
    expect(jobPatchSchema.safeParse({ priority: 6 }).success).toBe(false)
    expect(jobPatchSchema.safeParse({ priority: 0 }).success).toBe(false)
  })

  it('fails with invalid interview_stage enum', () => {
    expect(jobPatchSchema.safeParse({ interview_stage: 'chatting' }).success).toBe(false)
  })

  it('accepts valid ISO dates for date fields', () => {
    expect(jobPatchSchema.safeParse({
      date_posted: '2026-07-01',
      date_applied: '2026-07-05',
      application_deadline: '2026-08-01',
    }).success).toBe(true)
  })

  it('rejects malformed dates for date fields', () => {
    expect(jobPatchSchema.safeParse({ date_posted: '3 days ago' }).success).toBe(false)
    expect(jobPatchSchema.safeParse({ date_applied: 'yesterday' }).success).toBe(false)
    expect(jobPatchSchema.safeParse({ application_deadline: '08-01-2026' }).success).toBe(false)
  })

  it('accepts empty string for date fields (edit form sends "" to clear)', () => {
    expect(jobPatchSchema.safeParse({
      date_posted: '',
      date_applied: '',
      application_deadline: '',
    }).success).toBe(true)
  })

  it('accepts date fields being absent (optional)', () => {
    expect(jobPatchSchema.safeParse({ notes: 'no dates here' }).success).toBe(true)
  })
})
