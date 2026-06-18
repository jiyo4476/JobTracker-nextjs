'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

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

export function useCompanies() {
  return useQuery<CompanyRow[]>({
    queryKey: ['companies'],
    queryFn: () => api.get<CompanyRow[]>('/companies'),
  })
}

export function useCompany(id: number) {
  return useQuery<CompanyDetail>({
    queryKey: ['companies', id],
    queryFn: () => api.get<CompanyDetail>(`/companies/${id}`),
  })
}

export function useCreateJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/jobs', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}

export function usePatchCompany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Record<string, unknown>) =>
      api.patch(`/companies/${id}`, body),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['companies'] })
      qc.invalidateQueries({ queryKey: ['companies', id] })
    },
  })
}

type Contact = {
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

export function useJob(id: string) {
  return useQuery<JobDetail>({
    queryKey: ['job', id],
    queryFn: () => api.get<JobDetail>(`/jobs/${id}`),
    enabled: !!id,
  })
}

export function usePatchJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string | number; body: Record<string, unknown> }) =>
      api.patch(`/jobs/${id}`, body),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['job', String(id)] })
      qc.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}

export function useDeleteJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string | number) => api.delete(`/jobs/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
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

export interface AnalyticsResponse {
  skillDemandOverTime: SkillDemandRow[]
  salaryDistribution: SalaryDistributionRow[]
  platformBreakdown: PlatformBreakdownRow[]
  remoteVsOnsiteByWeek: RemoteVsOnsiteRow[]
}

export function useAnalytics(params?: AnalyticsParams) {
  const qs = new URLSearchParams()
  if (params?.from) qs.set('from', params.from)
  if (params?.to) qs.set('to', params.to)
  if (params?.platform) qs.set('platform', params.platform)
  const query = qs.toString()
  return useQuery<AnalyticsResponse>({
    queryKey: ['analytics', params],
    queryFn: () => api.get<AnalyticsResponse>(`/analytics${query ? `?${query}` : ''}`),
  })
}

export interface JobListItem {
  id: number
  jobTitle: string
  jobLink: string | null
  jobLocation: string | null
  isRemote: boolean
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
  is_remote?: string
}

export function useJobs(params: JobsParams = {}) {
  const qs = new URLSearchParams()
  if (params.page) qs.set('page', String(params.page))
  if (params.q) qs.set('q', params.q)
  if (params.stage) qs.set('stage', params.stage)
  if (params.platform) qs.set('platform', params.platform)
  if (params.job_type) qs.set('job_type', params.job_type)
  if (params.is_remote) qs.set('is_remote', params.is_remote)

  return useQuery<JobsResponse>({
    queryKey: ['jobs', params],
    queryFn: () => api.get<JobsResponse>(`/jobs?${qs.toString()}`),
  })
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

export function useStats() {
  return useQuery<StatsResponse>({
    queryKey: ['stats'],
    queryFn: () => api.get<StatsResponse>('/stats'),
    staleTime: 60_000,
  })
}

export interface LookupItem {
  id: number
  name: string
  jobCount?: number
}

export function useSkills() {
  return useQuery<LookupItem[]>({
    queryKey: ['skills'],
    queryFn: () => api.get<LookupItem[]>('/skills'),
  })
}

export function useSoftware() {
  return useQuery<LookupItem[]>({
    queryKey: ['software'],
    queryFn: () => api.get<LookupItem[]>('/software'),
  })
}

export function useCertifications() {
  return useQuery<LookupItem[]>({
    queryKey: ['certifications'],
    queryFn: () => api.get<LookupItem[]>('/certifications'),
  })
}
