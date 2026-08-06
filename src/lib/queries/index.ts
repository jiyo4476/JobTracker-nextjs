'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type {
  ActivityItem,
  CompanyRow, CompanyDetail,
  JobDetail, JobsResponse, JobsParams,
  LookupItem, StatsResponse, ResumeVersion, UserSkill,
  TagLookupType,
  UserTaxonomyCategory, UserTaxonomyCreateVariables, UserTaxonomyGapParams, UserTaxonomyGapResponse,
  UserTaxonomyPatchVariables, UserTaxonomyResponse,
  AnalyticsParams, AnalyticsResponse,
  TaxonomyAnalyticsParams, TaxonomyAnalyticsResponse,
  TaxonomyCategory, TaxonomyClearanceComparison,
  SalaryPatchResponse, TagsPatchResponse,
} from '@/types/queries'
import { optimisticJobsUpdate, type JobStateAction } from '@/lib/job-state'
import { catalogKeys, personalKeys, personalRoots, type UserScopeId } from '@/lib/queries/keys'
import { useUserScope } from '@/lib/identity-scope'

// Re-export all types so consumers can import from '@/lib/queries' unchanged
export type {
  ActivityItem,
  CompanyRow, CompanyDetail, CompanyTaxonomyDemand, CompanyTaxonomyDemandItem,
  Contact,
  JobDetail, JobListItem, JobsResponse, JobsParams, JobScope,
  UserJobState, SelectedResume,
  LookupItem, MeResponse, StatsResponse, StatsCatalog, ResumeVersion, UserSkill,
  TagLookupType,
  UserTaxonomyCategory, UserTaxonomyCreatePayload, UserTaxonomyCreateVariables,
  UserTaxonomyGapItem, UserTaxonomyGapParams, UserTaxonomyGapResponse, UserTaxonomyItem, UserTaxonomyPatchPayload,
  UserTaxonomyPatchVariables, UserTaxonomyResponse,
  AnalyticsParams, AnalyticsResponse,
  TaxonomyCategory, TaxonomyAnalyticsParams, TaxonomyAnalyticsResponse, TaxonomyAnalyticsRow,
  TaxonomyClearanceComparison,
  SkillDemandRow, SalaryDistributionRow, PlatformBreakdownRow, RemoteVsOnsiteRow,
  SalaryPatchResponse, TagsPatchResponse,
} from '@/types/queries'

export {
  catalogKeys, personalKeys, personalRoots,
  isPersonalKeyFor, isUserScopedKey, USER_SCOPE_SEGMENT,
} from '@/lib/queries/keys'
export type { UserScopeId } from '@/lib/queries/keys'
export {
  useIdentity, useIdentityIsStale, useIsAdmin, useMe, useUserScope,
} from '@/lib/identity-scope'

// ── Identity (PAGE-017) ──────────────────────────────────────────────────────
// `GET /api/me` is the ONLY source of the client-visible `users.id`. Every personal
// query key embeds it, and every personal query stays disabled until it resolves, so
// a request is never issued — and a cache entry never written — without a known owner.

// ── Catalog-global reads (identity-free keys — see lib/queries/keys.ts) ───────

export function useCompanies() {
  return useQuery<CompanyRow[]>({
    queryKey: catalogKeys.companies(),
    queryFn: () => api.get<CompanyRow[]>('/companies'),
  })
}

// Company DETAIL is personal: it carries `trackedJobCount` and the caller's own
// tracked jobs at the company, so it is keyed by owner (unlike the company list).
export function useCompany(id: number) {
  const userId = useUserScope()
  return useQuery<CompanyDetail>({
    queryKey: personalKeys.company(userId as UserScopeId, id),
    queryFn: () => api.get<CompanyDetail>(`/companies/${id}`),
    enabled: userId !== undefined && Number.isInteger(id) && id > 0,
  })
}

// ── Admin catalog mutations (PAGE-017 / API-013 `/api/admin/jobs`) ───────────
// These are the ONLY hooks that write shared catalog facts. They target the canonical
// admin namespace rather than the deprecated `/api/jobs[/id]` aliases.
//
// `useIsAdmin()` (from GET /api/me) only decides whether the UI renders the controls.
// It is a presentation hint: every call below is independently re-authorized server-side
// by `resolveAdminUser` (401 unauthenticated, 403 non-admin/inactive), so a tampered
// client that forces the request still cannot mutate the catalog.
export function useCreateCatalogJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<{ job_id: number }>('/admin/jobs', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: personalRoots.jobs() })
      qc.invalidateQueries({ queryKey: catalogKeys.companies() })
    },
    onError: () => {
      toast.error('Failed to create catalog job')
    },
  })
}

export function usePatchCatalogJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string | number; body: Record<string, unknown> }) =>
      api.patch(`/admin/jobs/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: personalRoots.job() })
      qc.invalidateQueries({ queryKey: personalRoots.jobs() })
      qc.invalidateQueries({ queryKey: personalRoots.companies() })
      toast.success('Catalog posting updated')
    },
    onError: () => {
      toast.error('Failed to update catalog posting')
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
  const userId = useUserScope()
  return useQuery<JobDetail>({
    queryKey: personalKeys.job(userId as UserScopeId, id),
    queryFn: () => api.get<JobDetail>(`/jobs/${id}`),
    enabled: userId !== undefined && !!id,
  })
}

// ── Owner-scoped personal job state (API-013 /api/jobs/[id]/state) ────────────
// These replace the old global PATCH /api/jobs/[id] for every personal field. They
// invalidate the full set of personal caches so the list, detail, dashboard, and
// activity feed all reflect the change.
function invalidatePersonalState(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: personalRoots.jobs() })
  qc.invalidateQueries({ queryKey: personalRoots.job() })
  qc.invalidateQueries({ queryKey: personalRoots.stats() })
  qc.invalidateQueries({ queryKey: personalRoots.activity() })
  qc.invalidateQueries({ queryKey: personalRoots.companies() })
}

// General-purpose PATCH of the caller's user_job_state. Used by the job-detail
// "My application" editor and the personal edit form. A sparse body creates the
// state row on first write. Returns the updated row.
export function usePatchJobState() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string | number; body: Record<string, unknown> }) =>
      api.patch(`/jobs/${id}/state`, body),
    onSuccess: () => invalidatePersonalState(qc),
    onError: () => {
      toast.error('Failed to save your application changes')
    },
  })
}

// Optimistic row-level personal actions for the jobs list: Save to My Jobs, Hide,
// Unhide, Remove from My Jobs. Rolls back every touched ['jobs'] cache on failure.
export function useJobStateAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action }: { id: number; action: JobStateAction }) => {
      if (action === 'remove') return api.delete(`/jobs/${id}/state`)
      const is_hidden = action === 'hide'
      return api.patch(`/jobs/${id}/state`, { is_hidden })
    },
    onMutate: async ({ id, action }) => {
      await qc.cancelQueries({ queryKey: ['jobs'] })
      const snapshots = qc.getQueriesData<JobsResponse>({ queryKey: ['jobs'] })
      for (const [key, data] of snapshots) {
        if (data) qc.setQueryData(key, optimisticJobsUpdate(data, id, action))
      }
      return { snapshots }
    },
    onError: (_err, { action }, context) => {
      for (const [key, data] of context?.snapshots ?? []) {
        qc.setQueryData(key, data)
      }
      const verb = action === 'remove' ? 'remove' : action
      toast.error(`Failed to ${verb} job`)
    },
    onSettled: () => invalidatePersonalState(qc),
  })
}

export function useTagLookup(type: TagLookupType, q: string) {
  const qs = new URLSearchParams({ type })
  if (q.trim()) qs.set('q', q.trim())
  return useQuery<LookupItem[]>({
    queryKey: catalogKeys.tags(type, q.trim()),
    queryFn: () => api.get<LookupItem[]>(`/tags?${qs.toString()}`),
  })
}

export function useTagLookupByIds(type: TagLookupType, ids: readonly number[]) {
  const canonicalIds = [...new Set(ids)].sort((a, b) => a - b)
  return useQuery<LookupItem[]>({
    queryKey: catalogKeys.tagsByIds(type, canonicalIds.join(',')),
    queryFn: () => api.get<LookupItem[]>(`/tags?${new URLSearchParams({
      type,
      ids: canonicalIds.join(','),
    }).toString()}`),
    enabled: canonicalIds.length > 0,
  })
}

// Admin-only catalog tag mutation (see the admin-namespace note above).
export function usePatchJobTags() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string | number; body: Record<string, string[]> }) =>
      api.patch<TagsPatchResponse>(`/admin/jobs/${id}/tags`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: personalRoots.job() })
      qc.invalidateQueries({ queryKey: ['jobs'] })
      toast.success('Job qualifications and keywords updated')
    },
    onError: () => {
      toast.error('Could not update job qualifications and keywords')
    },
  })
}

// Admin-only catalog salary mutation (see the admin-namespace note above).
export function usePatchJobSalary() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string | number; body: Record<string, unknown> }) =>
      api.patch<SalaryPatchResponse>(`/admin/jobs/${id}/salary`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: personalRoots.job() })
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

// Admin-only GLOBAL soft delete of a catalog posting (see the admin-namespace note
// above). This is NOT "remove from my tracker" — that is `useJobStateAction('remove')`.
export function useDeleteJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (variables: DeleteJobVariables) => {
      const id = getDeleteJobId(variables)
      return api.delete(`/admin/jobs/${id}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] })
      qc.invalidateQueries({ queryKey: personalRoots.job() })
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: personalRoots.job() })
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: personalRoots.job() })
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: personalRoots.job() })
    },
    onError: () => {
      toast.error('Failed to delete contact')
    },
  })
}

export function useJobs(params: JobsParams = {}) {
  const userId = useUserScope()
  const qs = new URLSearchParams()
  if (params.scope) qs.set('scope', params.scope)
  if (params.has_applied) qs.set('has_applied', params.has_applied)
  if (params.page) qs.set('page', String(params.page))
  if (params.company_id) qs.set('company_id', String(params.company_id))
  if (params.q) qs.set('q', params.q)
  if (params.stage) qs.set('stage', params.stage)
  if (params.platform) qs.set('platform', params.platform)
  if (params.job_type) qs.set('job_type', params.job_type)
  if (params.experience_level) qs.set('experience_level', params.experience_level)
  if (params.security_clearance) qs.set('security_clearance', params.security_clearance)
  if (params.is_remote) qs.set('is_remote', params.is_remote)
  if (params.is_active) qs.set('is_active', params.is_active)
  if (params.skill_ids) qs.set('skill_ids', params.skill_ids)
  if (params.software_ids) qs.set('software_ids', params.software_ids)
  if (params.certification_ids) qs.set('certification_ids', params.certification_ids)
  if (params.keyword_ids) qs.set('keyword_ids', params.keyword_ids)
  if (params.salary_min !== undefined) qs.set('salary_min', String(params.salary_min))
  if (params.salary_max !== undefined) qs.set('salary_max', String(params.salary_max))
  if (params.priority_min !== undefined) qs.set('priority_min', String(params.priority_min))
  if (params.sort_by) qs.set('sort_by', params.sort_by)
  if (params.sort_order) qs.set('sort_order', params.sort_order)

  return useQuery<JobsResponse>({
    queryKey: personalKeys.jobs(userId as UserScopeId, params),
    queryFn: () => api.get<JobsResponse>(`/jobs?${qs.toString()}`),
    enabled: userId !== undefined,
  })
}

export function useStats() {
  const userId = useUserScope()
  return useQuery<StatsResponse>({
    queryKey: personalKeys.stats(userId as UserScopeId),
    queryFn: () => api.get<StatsResponse>('/stats'),
    enabled: userId !== undefined,
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
    queryKey: catalogKeys.analytics(params),
    queryFn: () => api.get<AnalyticsResponse>(`/analytics${query ? `?${query}` : ''}`),
  })
}

export function useTaxonomyAnalytics(params: TaxonomyAnalyticsParams) {
  const qs = new URLSearchParams({ category: params.category })
  if (params.compare) qs.set('compare', params.compare)
  if (params.limit !== undefined) qs.set('limit', String(params.limit))
  if (params.from) qs.set('from', params.from)
  if (params.to) qs.set('to', params.to)
  if (params.platform) qs.set('platform', params.platform)
  if (params.security_clearance !== undefined) {
    qs.set('security_clearance', String(params.security_clearance))
  }

  return useQuery<TaxonomyAnalyticsResponse>({
    queryKey: catalogKeys.taxonomyAnalytics(params),
    queryFn: () => api.get<TaxonomyAnalyticsResponse>(`/analytics/taxonomy?${qs.toString()}`),
    staleTime: 60 * 60 * 1000,
  })
}

export function useTaxonomyClearanceComparison(category: TaxonomyCategory) {
  return useQuery<TaxonomyClearanceComparison>({
    queryKey: catalogKeys.taxonomyClearanceComparison(category),
    queryFn: async () => {
      if (category === 'skills') {
        const response = await api.get<{
          clearance_required: Array<{ skill: string; count: number; percentage: number }>
          clearance_not_required: Array<{ skill: string; count: number; percentage: number }>
        }>('/analytics/skills-by-clearance')
        return {
          clearance_required: response.clearance_required.map(({ skill, ...row }) => ({ name: skill, ...row })),
          clearance_not_required: response.clearance_not_required.map(({ skill, ...row }) => ({ name: skill, ...row })),
        }
      }

      const response = await api.get<TaxonomyAnalyticsResponse>(
        `/analytics/taxonomy?category=${category}&compare=clearance&limit=15`,
      )
      return {
        clearance_required: response.clearance_required ?? [],
        clearance_not_required: response.clearance_not_required ?? [],
      }
    },
    staleTime: 60 * 60 * 1000,
  })
}

export function useActivity() {
  const userId = useUserScope()
  return useQuery<ActivityItem[]>({
    queryKey: personalKeys.activity(userId as UserScopeId),
    queryFn: () => api.get<ActivityItem[]>('/activity'),
    enabled: userId !== undefined,
    staleTime: 30_000,
  })
}

export function useResumeVersions() {
  const userId = useUserScope()
  return useQuery<ResumeVersion[]>({
    queryKey: personalKeys.resumeVersions(userId as UserScopeId),
    queryFn: () => api.get<ResumeVersion[]>('/resume-versions'),
    enabled: userId !== undefined,
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
    queryKey: catalogKeys.skills(),
    queryFn: () => api.get<LookupItem[]>('/skills'),
  })
}

export function useUserSkills() {
  const userId = useUserScope()
  return useQuery<UserSkill[]>({
    queryKey: personalKeys.userSkills(userId as UserScopeId),
    queryFn: () => api.get<UserSkill[]>('/user-skills'),
    enabled: userId !== undefined,
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

export function useUserTaxonomies(category: UserTaxonomyCategory) {
  const userId = useUserScope()
  return useQuery<UserTaxonomyResponse>({
    queryKey: personalKeys.userTaxonomies(userId as UserScopeId, category),
    queryFn: () => api.get<UserTaxonomyResponse>(`/user-taxonomies/${category}`),
    enabled: userId !== undefined,
  })
}

export function useUserTaxonomyGap(
  category: UserTaxonomyCategory,
  params: UserTaxonomyGapParams = {},
) {
  const userId = useUserScope()
  const jobTitle = params.jobTitle?.trim() ?? ''
  const searchParams = new URLSearchParams({ limit: '100' })
  if (jobTitle) searchParams.set('job_title', jobTitle)
  return useQuery<UserTaxonomyGapResponse>({
    // PAGE-017 owner scoping + API-015 title scoping: the key carries BOTH, so neither
    // two identities nor two titles can ever share a cache entry.
    queryKey: personalKeys.userTaxonomyGap(userId as UserScopeId, category, jobTitle),
    queryFn: () => api.get<UserTaxonomyGapResponse>(
      `/user-taxonomies/${category}/gap?${searchParams.toString()}`,
    ),
    enabled: userId !== undefined,
  })
}

export function useCreateUserTaxonomy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ category, body }: UserTaxonomyCreateVariables) =>
      api.post(`/user-taxonomies/${category}`, body),
    onSuccess: (_data, { category }) => {
      qc.invalidateQueries({ queryKey: personalRoots.userTaxonomies() })
      qc.invalidateQueries({ queryKey: ['tags', category] })
    },
    onError: () => {
      toast.error('Failed to add profile item')
    },
  })
}

export function usePatchUserTaxonomy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ category, taxonomyId, body }: UserTaxonomyPatchVariables) =>
      api.patch(`/user-taxonomies/${category}/${taxonomyId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: personalRoots.userTaxonomies() })
    },
    onError: () => {
      toast.error('Failed to update profile item')
    },
  })
}

export function useDeleteUserTaxonomy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ category, taxonomyId }: {
      category: UserTaxonomyCategory
      taxonomyId: number
    }) => api.delete(`/user-taxonomies/${category}/${taxonomyId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: personalRoots.userTaxonomies() })
    },
    onError: () => {
      toast.error('Failed to remove profile item')
    },
  })
}

export function useSoftware() {
  return useQuery<LookupItem[]>({
    queryKey: catalogKeys.software(),
    queryFn: () => api.get<LookupItem[]>('/software'),
  })
}

export function useCertifications() {
  return useQuery<LookupItem[]>({
    queryKey: catalogKeys.certifications(),
    queryFn: () => api.get<LookupItem[]>('/certifications'),
  })
}
