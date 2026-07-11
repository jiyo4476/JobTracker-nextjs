import { z } from 'zod'
import { sourcePlatformValues } from '@/lib/source-platforms'

export const sourcePlatformEnum = z.enum(sourcePlatformValues)
export const jobTypeEnum = z.enum(['full_time','part_time','contract','internship','temp','freelance'])
export const experienceLevelEnum = z.enum(['entry','mid','senior','lead','executive'])
export const salaryTypeEnum = z.enum(['annual','hourly'])
export const interviewStageEnum = z.enum([
  'not_applied','applied','phone_screen','technical_screen','onsite','offer_received','rejected','withdrawn'
])

// Zod's .url() doesn't restrict scheme (it accepts javascript:/data: URIs), and these
// values get rendered as clickable links in the UI — restrict to http(s) only.
const httpUrlSchema = z.string().url().refine(
  (v) => /^https?:\/\//i.test(v),
  'Must be an http(s) URL'
)

const tagArraySchema = z.array(z.string().trim().min(1).max(100)).max(100)

export const scrapePayloadSchema = z.object({
  source_platform: sourcePlatformEnum,
  external_job_id: z.string().min(1).max(500),
  company_name: z.string().min(1).max(500),
  job_title: z.string().trim().min(1).max(500),
  job_link: httpUrlSchema,
  job_location: z.string().max(300).optional(),
  is_remote: z.boolean().default(false),
  job_description: z.string().max(50_000).optional(),
  date_posted: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be ISO date (YYYY-MM-DD)').optional(),
  salary_text: z.string().max(200).optional(),
  salary_type: salaryTypeEnum.optional(),
  salary_min: z.number().int().optional(),
  salary_max: z.number().int().optional(),
  hourly_rate_min: z.number().optional(),
  hourly_rate_max: z.number().optional(),
  job_type: jobTypeEnum.optional(),
  experience_level: experienceLevelEnum.optional(),
  posting_md_path: z.string()
    .max(300)
    .regex(/^[a-z0-9_-]+\/[a-z0-9_.-]+\.md$/, 'Must be in the form platform/job_id.md (lowercase only)')
    .optional(),
  security_clearance_req: z.boolean().default(false),
  skills: tagArraySchema.default([]),
  software: tagArraySchema.default([]),
  keywords: tagArraySchema.default([]),
  certifications: tagArraySchema.default([]),
})

// Patch date fields also accept '' — the edit form sends empty string to clear a date;
// the route maps '' to NULL before the DB write.
const patchDateString = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Must be ISO date (YYYY-MM-DD)')

export const jobPatchSchema = z.object({
  job_title: z.string().trim().min(1).max(500).optional(),
  job_location: z.string().max(300).optional(),
  is_remote: z.boolean().optional(),
  job_description: z.string().max(50_000).optional(),
  date_posted: patchDateString.optional(),
  salary_text: z.string().max(200).optional(),
  salary_type: salaryTypeEnum.optional(),
  salary_min: z.number().int().optional(),
  salary_max: z.number().int().optional(),
  hourly_rate_min: z.number().optional(),
  hourly_rate_max: z.number().optional(),
  job_type: jobTypeEnum.optional(),
  experience_level: experienceLevelEnum.optional(),
  security_clearance_req: z.boolean().optional(),
  has_applied: z.boolean().optional(),
  date_applied: patchDateString.optional(),
  heard_back: z.boolean().optional(),
  interview_stage: interviewStageEnum.optional(),
  is_active: z.boolean().optional(),
  priority: z.number().int().min(1).max(5).optional(),
  notes: z.string().max(20_000).optional(),
  resume_version: z.string().max(200).optional(),
  rejection_reason: z.string().max(2_000).optional(),
  referral: z.boolean().optional(),
  cover_letter_submitted: z.boolean().optional(),
  application_deadline: patchDateString.optional(),
}).strict()

export const manualJobSchema = z.object({
  job_title: z.string().trim().min(1).max(500),
  job_link: httpUrlSchema.optional(),
  job_location: z.string().max(300).optional(),
  is_remote: z.boolean().optional(),
  company_id: z.number().int().positive().optional(),
  notes: z.string().max(20_000).optional(),
  job_type: jobTypeEnum.optional(),
  experience_level: experienceLevelEnum.optional(),
  priority: z.number().int().min(1).max(5).optional(),
  salary_text: z.string().max(200).optional(),
}).strict()

export const contactCreateSchema = z.object({
  name: z.string().min(1).max(300),
  title: z.string().max(300).optional(),
  email: z.string().email().max(320).optional(),
  phone: z.string().max(50).optional(),
  linkedin_url: httpUrlSchema.optional(),
  role: z.string().max(300).optional(),
  contacted_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(20_000).optional(),
}).strict()

export const contactPatchSchema = contactCreateSchema.partial().refine(
  value => Object.keys(value).length > 0,
  { message: 'At least one field is required' }
)

export const userSkillCreateSchema = z
  .object({
    skill_id: z.number().int().positive().optional(),
    name: z.string().min(1).optional(),
  })
  .refine((d) => d.skill_id !== undefined || d.name !== undefined, {
    message: 'Either skill_id or name must be provided',
  })

export const companyPatchSchema = z.object({
  name: z.string().max(500).optional(),
  website: httpUrlSchema.optional(),
  industry: z.string().max(300).optional(),
  hq_location: z.string().max(300).optional(),
  glassdoor_url: httpUrlSchema.optional(),
  linkedin_url: httpUrlSchema.optional(),
  notes: z.string().max(20_000).optional(),
})

export const resumeVersionCreateSchema = z.object({
  label: z.string().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be ISO date (YYYY-MM-DD)').optional(),
  notes: z.string().max(20_000).optional(),
}).strict()

export const resumeVersionPatchSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be ISO date (YYYY-MM-DD)').optional(),
  notes: z.string().max(20_000).optional(),
}).strict()

export const jobTagsPatchSchema = z.object({
  skills: tagArraySchema.optional(),
  software: tagArraySchema.optional(),
  keywords: tagArraySchema.optional(),
  certifications: tagArraySchema.optional(),
}).strict().refine(
  value => Object.keys(value).length > 0,
  { message: 'At least one tag array is required' }
)

// hourly_rate_* is capped so hourly * 2080 * 100 (annual-equivalent cents)
// stays within the integer column's range (int4 max ~2.1B).
const nullableMoney = z.number()
  .nonnegative()
  .max(10_000, 'Must be at most $10,000/hr')
  .refine(value => Number(value.toFixed(2)) === value, 'Must have at most 2 decimal places')
  .nullable()
// salary_min/salary_max are annual-equivalent cents, matching jobPatchSchema's contract.
const nullableAnnualSalary = z.number().int().positive().max(100_000_000, 'Must be at most $1,000,000').nullable()
const nullableCurrency = z.string().regex(/^[A-Z]{3}$/, 'Must be a 3-letter ISO 4217 code').nullable()

export const jobSalaryPatchSchema = z.object({
  salary_type: salaryTypeEnum.nullable().optional(),
  salary_min: nullableAnnualSalary.optional(),
  salary_max: nullableAnnualSalary.optional(),
  hourly_rate_min: nullableMoney.optional(),
  hourly_rate_max: nullableMoney.optional(),
  salary_currency: nullableCurrency.optional(),
  salary_text: z.string().nullable().optional(),
}).strict()
  .refine(value => Object.keys(value).length > 0, {
    message: 'At least one salary field is required',
  })
  .refine(value => !(
    (value.salary_min === undefined) !== (value.salary_max === undefined)
  ), {
    message: 'salary_min and salary_max must be provided together',
    path: ['salary_max'],
  })
  .refine(value => !(
    value.salary_min !== undefined &&
    value.salary_max !== undefined &&
    (value.salary_min === null) !== (value.salary_max === null)
  ), {
    message: 'salary_min and salary_max must both be set or both be cleared',
    path: ['salary_max'],
  })
  .refine(value => !(
    value.salary_min != null &&
    value.salary_max != null &&
    value.salary_min > value.salary_max
  ), {
    message: 'salary_min must be less than or equal to salary_max',
    path: ['salary_max'],
  })
  .refine(value => !(
    (value.hourly_rate_min === undefined) !== (value.hourly_rate_max === undefined)
  ), {
    message: 'hourly_rate_min and hourly_rate_max must be provided together',
    path: ['hourly_rate_max'],
  })
  .refine(value => !(
    value.hourly_rate_min !== undefined &&
    value.hourly_rate_max !== undefined &&
    (value.hourly_rate_min === null) !== (value.hourly_rate_max === null)
  ), {
    message: 'hourly_rate_min and hourly_rate_max must both be set or both be cleared',
    path: ['hourly_rate_max'],
  })
  .refine(value => !(
    value.hourly_rate_min != null &&
    value.hourly_rate_max != null &&
    value.hourly_rate_min > value.hourly_rate_max
  ), {
    message: 'hourly_rate_min must be less than or equal to hourly_rate_max',
    path: ['hourly_rate_max'],
  })
  .refine(value => !(
    value.salary_type === 'annual' &&
    (value.salary_min == null || value.salary_max == null)
  ), {
    message: 'salary_min and salary_max are required when changing salary_type to annual',
    path: ['salary_min'],
  })
  .refine(value => !(
    value.salary_type === 'hourly' &&
    (value.hourly_rate_min == null || value.hourly_rate_max == null)
  ), {
    message: 'hourly_rate_min and hourly_rate_max are required when changing salary_type to hourly',
    path: ['hourly_rate_min'],
  })
  .refine(value => !(
    value.salary_type === undefined &&
    value.salary_min !== undefined &&
    value.hourly_rate_min !== undefined
  ), {
    message: 'salary_type is required when both annual and hourly ranges are provided',
    path: ['salary_type'],
  })
