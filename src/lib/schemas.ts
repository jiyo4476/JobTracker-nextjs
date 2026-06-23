import { z } from 'zod'

export const sourcePlatformEnum = z.enum([
  'linkedin','indeed','glassdoor','dice','lever','greenhouse','workday','angellist','direct','other'
])
export const jobTypeEnum = z.enum(['full_time','part_time','contract','internship','temp','freelance'])
export const experienceLevelEnum = z.enum(['entry','mid','senior','lead','executive'])
export const salaryTypeEnum = z.enum(['annual','hourly'])
export const interviewStageEnum = z.enum([
  'not_applied','applied','phone_screen','technical_screen','onsite','offer_received','rejected','withdrawn'
])

export const scrapePayloadSchema = z.object({
  source_platform: sourcePlatformEnum,
  external_job_id: z.string().min(1),
  company_name: z.string().min(1),
  job_title: z.string().min(1),
  job_link: z.string().url(),
  job_location: z.string().optional(),
  is_remote: z.boolean().default(false),
  job_description: z.string().optional(),
  date_posted: z.string().optional(),
  salary_text: z.string().optional(),
  salary_type: salaryTypeEnum.optional(),
  salary_min: z.number().int().optional(),
  salary_max: z.number().int().optional(),
  hourly_rate_min: z.number().optional(),
  hourly_rate_max: z.number().optional(),
  job_type: jobTypeEnum.optional(),
  experience_level: experienceLevelEnum.optional(),
  posting_md_path: z.string()
    .regex(/^[a-z0-9_-]+\/[a-z0-9_.-]+\.md$/, 'Must be in the form platform/job_id.md (lowercase only)')
    .optional(),
  security_clearance_req: z.boolean().default(false),
  skills: z.array(z.string()).default([]),
  software: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  certifications: z.array(z.string()).default([]),
})

export const jobPatchSchema = z.object({
  job_title: z.string().optional(),
  job_location: z.string().optional(),
  is_remote: z.boolean().optional(),
  job_description: z.string().optional(),
  date_posted: z.string().optional(),
  salary_text: z.string().optional(),
  salary_type: salaryTypeEnum.optional(),
  salary_min: z.number().int().optional(),
  salary_max: z.number().int().optional(),
  hourly_rate_min: z.number().optional(),
  hourly_rate_max: z.number().optional(),
  job_type: jobTypeEnum.optional(),
  experience_level: experienceLevelEnum.optional(),
  security_clearance_req: z.boolean().optional(),
  has_applied: z.boolean().optional(),
  date_applied: z.string().optional(),
  heard_back: z.boolean().optional(),
  interview_stage: interviewStageEnum.optional(),
  is_active: z.boolean().optional(),
  priority: z.number().int().min(1).max(5).optional(),
  notes: z.string().optional(),
  resume_version: z.string().optional(),
  rejection_reason: z.string().optional(),
  referral: z.boolean().optional(),
  cover_letter_submitted: z.boolean().optional(),
  application_deadline: z.string().optional(),
}).strict()

export const manualJobSchema = z.object({
  job_title: z.string().min(1),
  job_link: z.string().url().optional(),
  job_location: z.string().optional(),
  is_remote: z.boolean().optional(),
  company_id: z.number().int().positive().optional(),
  notes: z.string().optional(),
  job_type: jobTypeEnum.optional(),
  experience_level: experienceLevelEnum.optional(),
  priority: z.number().int().min(1).max(5).optional(),
  salary_text: z.string().optional(),
}).strict()

export const contactCreateSchema = z.object({
  name: z.string().min(1),
  title: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  linkedin_url: z.string().url().optional(),
  role: z.string().optional(),
  contacted_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().optional(),
}).strict()

export const contactPatchSchema = contactCreateSchema.partial()

export const companyPatchSchema = z.object({
  name: z.string().optional(),
  website: z.string().url().optional(),
  industry: z.string().optional(),
  hq_location: z.string().optional(),
  glassdoor_url: z.string().url().optional(),
  linkedin_url: z.string().url().optional(),
  notes: z.string().optional(),
})
