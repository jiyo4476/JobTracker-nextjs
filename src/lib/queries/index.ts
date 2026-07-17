'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type {
  ActivityItem,
  CompanyRow, CompanyDetail,
  JobDetail, JobsResponse, JobsParams,
  LookupItem, StatsResponse, ResumeVersion, UserSkill,
  AnalyticsParams, AnalyticsResponse,
  SalaryPatchResponse, TagsPatchResponse,
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
  SalaryPatchResponse, TagsPatchResponse,
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
    enabled: Number.isInteger(id) && id > 0,
  })
}

export function useCreateJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/jobs', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] })
    },
    onError: () => {
      toast.error('Failed to create job')
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
    onError: () => {
      toast.error('Failed to update company')
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
    onError: () => {
      toast.error('Failed to save job changes')
    },
  })
}

export type TagLookupType = 'skills' | 'software' | 'keywords' | 'certifications'

export function useTagLookup(type: TagLookupType, q: string) {
  const qs = new URLSearchParams({ type })
  if (q.trim()) qs.set('q', q.trim())
  return useQuery<LookupItem[]>({
    queryKey: ['tags', type, q.trim()],
    queryFn: () => api.get<LookupItem[]>(`/tags?${qs.toString()}`),
  })
}

export function usePatchJobTags() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string | number; body: Record<string, string[]> }) =>
      api.patch<TagsPatchResponse>(`/jobs/${id}/tags`, body),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['job', String(id)] })
      qc.invalidateQueries({ queryKey: ['jobs'] })
      toast.success('Tags updated')
    },
    onError: () => {
      toast.error('Tag update failed')
    },
  })
}

export function usePatchJobSalary() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string | number; body: Record<string, unknown> }) =>
      api.patch<SalaryPatchResponse>(`/jobs/${id}/salary`, body),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['job', String(id)] })
      qc.invalidateQueries({ queryKey: ['jobs'] })
      toast.success('Salary updated')
    },
    onError: () => {
      toast.error('Salary update failed')
    },
  })
}

type DeleteJobVariables = string | number | {
  id: string | number
  showErrorToast?: boolean
}

class DeleteJobValidationError extends Error {
  constructor() {
    super('Missing job id')
    this.name = 'DeleteJobValidationError'
  }
}

function isDeleteJobVariables(variables: unknown): variables is DeleteJobVariables {
  if (typeof variables === 'string' || typeof variables === 'number') return true
  return !!variables &&
    typeof variables === 'object' &&
    'id' in variables &&
    (typeof variables.id === 'string' || typeof variables.id === 'number')
}

function getDeleteJobId(variables: unknown) {
  if (!isDeleteJobVariables(variables)) throw new DeleteJobValidationError()
  return typeof variables === 'object' ? variables.id : variables
}

function shouldShowDeleteErrorToast(variables: unknown) {
  return !(variables &&
    typeof variables === 'object' &&
    'showErrorToast' in variables &&
    variables.showErrorToast === false)
}

export function useDeleteJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (variables: DeleteJobVariables) => {
      const id = getDeleteJobId(variables)
      return api.delete(`/jobs/${id}`)
    },
    onSuccess: (_data, variables) => {
      const id = getDeleteJobId(variables)
      qc.invalidateQueries({ queryKey: ['jobs'] })
      qc.invalidateQueries({ queryKey: ['job', String(id)] })
    },
    onError: (err, variables) => {
      if (!shouldShowDeleteErrorToast(variables)) return
      console.error('Delete job failed', err)
      toast.error(err instanceof DeleteJobValidationError
        ? 'Delete failed because the job id was missing.'
        : 'Delete failed. Please try again.')
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
    onError: () => {
      toast.error('Failed to add contact')
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
    onError: () => {
      toast.error('Failed to update contact')
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
    onError: () => {
      toast.error('Failed to delete contact')
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
  if (params.is_active) qs.set('is_active', params.is_active)
  if (params.skill_ids) qs.set('skill_ids', params.skill_ids)
  if (params.salary_min !== undefined) qs.set('salary_min', String(params.salary_min))
  if (params.salary_max !== undefined) qs.set('salary_max', String(params.salary_max))
  if (params.priority_min !== undefined) qs.set('priority_min', String(params.priority_min))

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
  if (params?.security_clearance !== undefined) qs.set('security_clearance', String(params.security_clearance))
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
    onError: () => {
      toast.error('Failed to create resume version')
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
    onError: () => {
      toast.error('Failed to update resume version')
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
    onError: () => {
      toast.error('Failed to delete resume version')
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
    onError: () => {
      toast.error('Failed to add skill')
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
    onError: () => {
      toast.error('Failed to remove skill')
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
