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
}

export type Contact = {
  id: number
  jobId: number | null
  name: string
  title: string | null
  email: string | null
  phone: string | null
  linkedinUrl: string | null
  notes: string | null
  createdAt: Date
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

export type UserTaxonomyCategory = 'skills' | 'software' | 'certifications' | 'keywords'

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

export type JobDetail = {
  id: number
  jobTitle: string
  jobLink: string | null
  jobLocation: string | null
  isRemote: boolean | null
  sourcePlatform: string | null
  externalJobId: string | null
  jobType: string | null
  experienceLevel: string | null
  jobDescription: string | null
  salaryType: string | null
  salaryMin: number | null
  salaryMax: number | null
  hourlyRateMin: string | null
  hourlyRateMax: string | null
  annualEquivalentMin: number | null
  annualEquivalentMax: number | null
  salaryText: string | null
  salaryCurrency: string | null
  hasApplied: boolean | null
  dateApplied: string | null
  heardBack: boolean | null
  interviewStage: string | null
  datePosted: string | null
  dateFound: string | null
  lastScrapedAt: string | null
  isActive: boolean | null
  applicationDeadline: string | null
  securityClearanceReq: boolean | null
  priority: number | null
  referral: boolean | null
  coverLetterSubmitted: boolean | null
  resumeVersion: string | null
  rejectionReason: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  companyId: number | null
  companyName: string | null
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
  sourcePlatform: string | null
  jobType: string | null
  experienceLevel: string | null
  salaryMin: number | null
  salaryMax: number | null
  annualEquivalentMin: number | null
  annualEquivalentMax: number | null
  salaryText: string | null
  hasApplied: boolean
  dateApplied: string | null
  interviewStage: string
  datePosted: string | null
  dateFound: string
  isActive: boolean
  priority: number | null
  securityClearanceReq: boolean | null
  companyId: number | null
  companyName: string | null
  createdAt: string
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
  total: number
  page: number
  totalPages: number
}

export interface JobsParams {
  page?: number
  company_id?: number
  q?: string
  stage?: string
  platform?: string
  job_type?: string
  experience_level?: string
  security_clearance?: 'true' | 'false'
  is_remote?: string
  is_active?: string
  skill_ids?: string
  software_ids?: string
  certification_ids?: string
  keyword_ids?: string
  salary_min?: number
  salary_max?: number
  priority_min?: number
}

export interface StatsResponse {
  totalJobs: number
  applied: number
  activeInterviews: number
  staleListings: number
  topSkills: { name: string; jobCount: number }[]
  weeklyJobCounts: { week: string; jobCount: number }[]
  remoteCount: number
  onsiteCount: number
  stageCounts: { stage: string | null; count: number }[]
}

export interface AnalyticsParams {
  from?: string
  to?: string
  platform?: string
  security_clearance?: boolean
}

export type TaxonomyCategory = 'skills' | 'software' | 'certifications' | 'keywords'

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
