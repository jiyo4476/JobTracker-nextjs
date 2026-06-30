'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  ActivityItem,
  CompanyRow, CompanyDetail,
  JobDetail, JobListItem, JobsResponse, JobsParams,
  LookupItem, StatsResponse, ResumeVersion, UserSkill,
  AnalyticsParams, AnalyticsResponse,
} from '@/types/queries'

// Re-export all types so consumers can import from '@/lib/queries' unchanged
export type {
  ActivityItem,
  CompanyRow, CompanyDetail,
  Contact,
  JobDetail, JobListItem, JobsResponse, JobsParams,
  LookupItem, StatsResponse, ResumeVersion, UserSkill,
  AnalyticsParams, AnalyticsResponse,
  SkillDemandRow, SalaryDistributionRow, PlatformBreakdownRow, RemoteVsOnsiteRow,
} from '@/types/queries'

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
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['jobs'] })
      qc.invalidateQueries({ queryKey: ['job', String(id)] })
    },
  })
}

export function useCreateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ jobId, body }: { jobId: string | number; body: Record<string, unknown> }) =>
      api.post(`/jobs/${jobId}/contacts`, body),
    onSuccess: (_data, { jobId }) => {
      qc.invalidateQueries({ queryKey: ['job', String(jobId)] })
    },
  })
}

export function usePatchContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      jobId,
      contactId,
      body,
    }: {
      jobId: string | number
      contactId: string | number
      body: Record<string, unknown>
    }) => api.patch(`/jobs/${jobId}/contacts/${contactId}`, body),
    onSuccess: (_data, { jobId }) => {
      qc.invalidateQueries({ queryKey: ['job', String(jobId)] })
    },
  })
}

export function useDeleteContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ jobId, contactId }: { jobId: string | number; contactId: string | number }) =>
      api.delete(`/jobs/${jobId}/contacts/${contactId}`),
    onSuccess: (_data, { jobId }) => {
      qc.invalidateQueries({ queryKey: ['job', String(jobId)] })
    },
  })
}

export function useJobs(params: JobsParams = {}) {
  const qs = new URLSearchParams()
  if (params.page) qs.set('page', String(params.page))
  if (params.q) qs.set('q', params.q)
  if (params.stage) qs.set('stage', params.stage)
  if (params.platform) qs.set('platform', params.platform)
  if (params.job_type) qs.set('job_type', params.job_type)
  if (params.experience_level) qs.set('experience_level', params.experience_level)
  if (params.security_clearance) qs.set('security_clearance', params.security_clearance)
  if (params.is_remote) qs.set('is_remote', params.is_remote)

  return useQuery<JobsResponse>({
    queryKey: ['jobs', params],
    queryFn: () => api.get<JobsResponse>(`/jobs?${qs.toString()}`),
  })
}

export function useStats() {
  return useQuery<StatsResponse>({
    queryKey: ['stats'],
    queryFn: () => api.get<StatsResponse>('/stats'),
    staleTime: 60_000,
  })
}

export function useAnalytics(params?: AnalyticsParams) {
  const qs = new URLSearchParams()
  if (params?.from) qs.set('from', params.from)
  if (params?.to) qs.set('to', params.to)
  if (params?.platform) qs.set('platform', params.platform)
  if (params?.security_clearance) qs.set('security_clearance', params.security_clearance)
  const query = qs.toString()
  return useQuery<AnalyticsResponse>({
    queryKey: ['analytics', params],
    queryFn: () => api.get<AnalyticsResponse>(`/analytics${query ? `?${query}` : ''}`),
  })
}

export function useActivity() {
  return useQuery<ActivityItem[]>({
    queryKey: ['activity'],
    queryFn: () => api.get<ActivityItem[]>('/activity'),
    staleTime: 30_000,
  })
}

export function useResumeVersions() {
  return useQuery<ResumeVersion[]>({
    queryKey: ['resume-versions'],
    queryFn: () => api.get<ResumeVersion[]>('/resume-versions'),
  })
}

export function useCreateResumeVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/resume-versions', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resume-versions'] })
    },
  })
}

export function usePatchResumeVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      api.patch(`/resume-versions/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resume-versions'] })
    },
  })
}

export function useDeleteResumeVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/resume-versions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resume-versions'] })
    },
  })
}

export function useSkills() {
  return useQuery<LookupItem[]>({
    queryKey: ['skills'],
    queryFn: () => api.get<LookupItem[]>('/skills'),
  })
}

export function useUserSkills() {
  return useQuery<UserSkill[]>({
    queryKey: ['user-skills'],
    queryFn: () => api.get<UserSkill[]>('/user-skills'),
  })
}

export function useCreateUserSkill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { skill_id: number; name?: never } | { name: string; skill_id?: never }) =>
      api.post('/user-skills', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-skills'] })
      qc.invalidateQueries({ queryKey: ['skills'] })
    },
  })
}

export function useDeleteUserSkill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (skillId: number) => api.delete(`/user-skills/${skillId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-skills'] })
      qc.invalidateQueries({ queryKey: ['skills'] })
    },
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
