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
  size: string | null
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
  companyId: number | null
  companyName: string | null
  createdAt: string
}

export interface JobsResponse {
  jobs: JobListItem[]
  total: number
  page: number
  totalPages: number
}

export interface JobsParams {
  page?: number
  q?: string
  stage?: string
  platform?: string
  job_type?: string
  experience_level?: string
  is_remote?: string
  is_active?: string
  skill_ids?: string
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
