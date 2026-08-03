import type { InferSelectModel } from 'drizzle-orm'
import type { contacts } from '@/db/schema'
import type { InterviewStage, JobType, ExperienceLevel } from '@/lib/enums'
import type { SourcePlatform } from '@/lib/source-platforms'
import type { TaxonomyCategory } from '@/lib/taxonomy'

// Single-source the taxonomy category set from the Zod schema in @/lib/taxonomy.
export type { TaxonomyCategory }

export type CompanyRow = {
  id: number
  name: string
  website: string | null
  industry: string | null
  hqLocation: string | null
  jobCount: number
  avgSalaryMax: number | null
}

export type CompanyDetail = CompanyRow & {
  sizeRange: string | null
  notes: string | null
  glassdoorUrl: string | null
  linkedinUrl: string | null
  jobs: Array<{
    id: number
    jobTitle: string
    interviewStage: string
    salaryMin: number | null
    salaryMax: number | null
    dateFound: string
  }>
  taxonomyDemand: CompanyTaxonomyDemand
}

export type CompanyTaxonomyDemandItem = {
  id: number
  name: string
  jobCount: number
}

export type CompanyTaxonomyDemand = {
  activeJobCount: number
  skills: CompanyTaxonomyDemandItem[]
  software: CompanyTaxonomyDemandItem[]
  certifications: CompanyTaxonomyDemandItem[]
  keywords: CompanyTaxonomyDemandItem[]
  truncated: Record<'skills' | 'software' | 'certifications' | 'keywords', boolean>
}

// Serialized `contacts` row as returned by the API: a present `created_at`
// timestamp arrives as an ISO string over JSON, not a Date. The column has a
// default but is not declared NOT NULL, so the serialized value remains nullable.
// All other columns match the row (jobId is NOT NULL in the schema).
export type Contact = Omit<InferSelectModel<typeof contacts>, 'createdAt'> & {
  createdAt: string | null
}

export interface LookupItem {
  id: number
  name: string
  jobCount?: number
}

export type ResumeVersion = {
  id: number
  label: string
  date: string | null
  notes: string | null
  createdAt: string
}

export type UserSkill = {
  skillId: number
  name: string
  hasSkill: boolean | null
}

export type UserTaxonomyCategory = TaxonomyCategory

export type UserSkillTaxonomyItem = {
  taxonomyId: number
  name: string
  hasSkill: boolean | null
}

export type UserSoftwareTaxonomyItem = {
  taxonomyId: number
  name: string
  familiarity: 'learning' | 'familiar' | 'proficient' | 'expert' | null
}

export type UserCertificationTaxonomyItem = {
  taxonomyId: number
  name: string
  issuer: string | null
  earnedDate: string | null
  expiresAt: string | null
  credentialUrl: string | null
}

export type UserKeywordTaxonomyItem = {
  taxonomyId: number
  name: string
  preference: 'interest' | 'exclusion'
}

export type UserTaxonomyItem =
  | UserSkillTaxonomyItem
  | UserSoftwareTaxonomyItem
  | UserCertificationTaxonomyItem
  | UserKeywordTaxonomyItem

export type UserTaxonomyResponse =
  | { category: 'skills'; items: UserSkillTaxonomyItem[] }
  | { category: 'software'; items: UserSoftwareTaxonomyItem[] }
  | { category: 'certifications'; items: UserCertificationTaxonomyItem[] }
  | { category: 'keywords'; items: UserKeywordTaxonomyItem[] }

export type UserTaxonomyCreateBody = {
  taxonomy_id: number
  name?: never
} | {
  name: string
  taxonomy_id?: never
}

type UserTaxonomyCreateMetadata = {
  skills: { has_skill?: boolean }
  software: { familiarity?: 'learning' | 'familiar' | 'proficient' | 'expert' | null }
  certifications: {
    issuer?: string | null
    earned_date?: string | null
    expires_at?: string | null
    credential_url?: string | null
  }
  keywords: { preference?: 'interest' | 'exclusion' }
}

type UserTaxonomyPatchMetadata = {
  skills: { has_skill: boolean }
  software: { familiarity: 'learning' | 'familiar' | 'proficient' | 'expert' | null }
  certifications: UserTaxonomyCreateMetadata['certifications']
  keywords: { preference: 'interest' | 'exclusion' }
}

export type UserTaxonomyCreatePayload<C extends UserTaxonomyCategory = UserTaxonomyCategory> =
  UserTaxonomyCreateBody & UserTaxonomyCreateMetadata[C]

export type UserTaxonomyPatchPayload<C extends UserTaxonomyCategory = UserTaxonomyCategory> =
  UserTaxonomyPatchMetadata[C]

export type UserTaxonomyCreateVariables = {
  [C in UserTaxonomyCategory]: { category: C; body: UserTaxonomyCreatePayload<C> }
}[UserTaxonomyCategory]

export type UserTaxonomyPatchVariables = {
  [C in UserTaxonomyCategory]: {
    category: C
    taxonomyId: number
    body: UserTaxonomyPatchPayload<C>
  }
}[UserTaxonomyCategory]

export type UserTaxonomyGapItem = {
  taxonomyId: number
  name: string
  jobCount: number
  profileStatus: string | null
  matchState: 'matched' | 'excluded' | 'gap'
}

export type UserTaxonomyGapResponse = {
  category: UserTaxonomyCategory
  counts: {
    profile: number
    demanded: number
    matched: number
    excluded: number
    gaps: number
  }
  items: UserTaxonomyGapItem[]
  page: number
  totalPages: number
}

// API-013: the three owner-scoped views of the jobs list. `tracked` = the caller's
// saved (non-hidden) jobs, `catalog` = the whole global catalog (tracked flag per row),
// `hidden` = the caller's hidden jobs.
export type JobScope = 'tracked' | 'catalog' | 'hidden'

// Nested personal overlay returned by GET /api/jobs/[id] (null when the caller has no
// user_job_state row for this job). Fields map 1:1 to user_job_state columns.
export interface UserJobState {
  priority: number | null
  isHidden: boolean
  hasApplied: boolean
  dateApplied: string | null
  heardBack: boolean
  interviewStage: InterviewStage
  referral: boolean
  coverLetterSubmitted: boolean
  resumeVersionId: number | null
  rejectionReason: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

// The caller's selected resume version, embedded in GET /api/jobs/[id] when
// userState.resumeVersionId is set and the resume belongs to the caller.
export interface SelectedResume {
  id: number
  label: string
  filePath: string | null
  date: string | null
  notes: string | null
}

export type JobDetail = {
  id: number
  jobTitle: string
  jobLink: string | null
  jobLocation: string | null
  isRemote: boolean | null
  sourcePlatform: SourcePlatform | null
  externalJobId: string | null
  jobType: JobType | null
  experienceLevel: ExperienceLevel | null
  jobDescription: string | null
  salaryType: 'annual' | 'hourly' | null
  salaryMin: number | null
  salaryMax: number | null
  hourlyRateMin: string | null
  hourlyRateMax: string | null
  annualEquivalentMin: number | null
  annualEquivalentMax: number | null
  salaryText: string | null
  salaryCurrency: string | null
  datePosted: string | null
  dateFound: string | null
  lastScrapedAt: string | null
  isActive: boolean | null
  applicationDeadline: string | null
  securityClearanceReq: boolean | null
  createdAt: string
  updatedAt: string
  companyId: number | null
  companyName: string | null
  // ── Transitional flattened personal fields (from user_job_state; null/default when untracked) ──
  hasApplied: boolean | null
  dateApplied: string | null
  heardBack: boolean | null
  interviewStage: InterviewStage | null
  priority: number | null
  referral: boolean | null
  coverLetterSubmitted: boolean | null
  rejectionReason: string | null
  notes: string | null
  // ── Owner-scope markers + nested contract ──
  isTracked: boolean
  isHidden: boolean
  userState: UserJobState | null
  selectedResume: SelectedResume | null
  skills: LookupItem[]
  software: LookupItem[]
  keywords: LookupItem[]
  certifications: LookupItem[]
  contacts: Contact[]
}

export interface JobListItem {
  id: number
  jobTitle: string
  jobLink: string | null
  jobLocation: string | null
  isRemote: boolean | null
  sourcePlatform: SourcePlatform | null
  jobType: JobType | null
  experienceLevel: ExperienceLevel | null
  salaryMin: number | null
  salaryMax: number | null
  salaryType: 'annual' | 'hourly' | null
  hourlyRateMin: string | null
  hourlyRateMax: string | null
  annualEquivalentMin: number | null
  annualEquivalentMax: number | null
  salaryText: string | null
  datePosted: string | null
  dateFound: string
  isActive: boolean
  securityClearanceReq: boolean | null
  companyId: number | null
  companyName: string | null
  createdAt: string
  // ── Personal overlay (null/false when the row is untracked, e.g. in catalog scope) ──
  isTracked: boolean
  isHidden: boolean
  hasApplied: boolean | null
  dateApplied: string | null
  heardBack: boolean | null
  interviewStage: InterviewStage | null
  priority: number | null
}

export type SalaryPatchResponse = Pick<
  JobDetail,
  | 'id'
  | 'salaryType'
  | 'salaryMin'
  | 'salaryMax'
  | 'hourlyRateMin'
  | 'hourlyRateMax'
  | 'annualEquivalentMin'
  | 'annualEquivalentMax'
  | 'salaryCurrency'
  | 'salaryText'
>

export type TagsPatchResponse = Pick<JobDetail, 'skills' | 'software' | 'keywords' | 'certifications'> & {
  counts: Record<'skills' | 'software' | 'keywords' | 'certifications', number>
}

export interface JobsResponse {
  jobs: JobListItem[]
  scope: JobScope
  total: number
  page: number
  totalPages: number
}

export interface JobsParams {
  scope?: JobScope
  page?: number
  company_id?: number
  q?: string
  stage?: string
  platform?: string
  job_type?: string
  experience_level?: string
  security_clearance?: 'true' | 'false'
  is_remote?: string
  has_applied?: 'true' | 'false'
  is_active?: string
  skill_ids?: string
  software_ids?: string
  certification_ids?: string
  keyword_ids?: string
  salary_min?: number
  salary_max?: number
  priority_min?: number
  sort_by?: 'company' | 'role' | 'stage' | 'location' | 'salary' | 'found' | 'priority' | 'clearance'
  sort_order?: 'asc' | 'desc'
}

/**
 * Catalog (global) supply metrics returned by GET /api/stats under a named block.
 * API-013 slice 2 quarantines these GLOBAL denominators away from the personal
 * numerators above so a private count is never silently mixed with a global one.
 * Dashboard charts sourced from this block MUST be labeled as global supply.
 */
export interface StatsCatalog {
  totalJobs: number
  topSkills: { name: string; jobCount: number }[]
  weeklyJobCounts: { week: string; jobCount: number }[]
  remoteCount: number
  onsiteCount: number
}

export interface StatsResponse {
  /** Marker that the top-level KPIs are the caller's personal state, not global. */
  scope: 'personal'
  // ── Personal application KPIs (caller's user_job_state) ──
  trackedJobs: number
  applied: number
  activeInterviews: number
  staleListings: number
  stageCounts: { stage: string | null; count: number }[]
  // ── Catalog supply metrics (global) ──
  catalog: StatsCatalog
}

export interface AnalyticsParams {
  from?: string
  to?: string
  platform?: string
  security_clearance?: boolean
}

export interface TaxonomyAnalyticsParams {
  category: TaxonomyCategory
  compare?: 'clearance'
  limit?: number
  from?: string
  to?: string
  platform?: string
  security_clearance?: boolean
}

export interface TaxonomyAnalyticsRow {
  name: string
  count: number
  percentage: number
}

export interface TaxonomyAnalyticsResponse {
  category: TaxonomyCategory
  percentage_denominator: string
  values?: TaxonomyAnalyticsRow[]
  clearance_required?: TaxonomyAnalyticsRow[]
  clearance_not_required?: TaxonomyAnalyticsRow[]
}

export interface TaxonomyClearanceComparison {
  clearance_required: TaxonomyAnalyticsRow[]
  clearance_not_required: TaxonomyAnalyticsRow[]
}

export interface SkillDemandRow {
  skill: string
  month: string
  count: number
}

export interface SalaryDistributionRow {
  job_type: string
  experience_level: string
  avg_min: number
  min_val: number
  max_val: number
}

export interface PlatformBreakdownRow {
  platform: string
  count: number
}

export interface RemoteVsOnsiteRow {
  week: string
  remote: number
  onsite: number
}

export interface ActivityItem {
  id: number
  jobId: number
  jobTitle: string
  companyName: string | null
  fromStage: string | null
  toStage: string
  changedAt: string
}

export interface AnalyticsResponse {
  skillDemandOverTime: SkillDemandRow[]
  salaryDistribution: SalaryDistributionRow[]
  platformBreakdown: PlatformBreakdownRow[]
  remoteVsOnsiteByWeek: RemoteVsOnsiteRow[]
}
