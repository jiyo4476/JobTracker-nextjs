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

  it('fails with an invalid job_type enum value', () => {
    expect(scrapePayloadSchema.safeParse({ ...validPayload, job_type: 'gig' }).success).toBe(false)
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
})
