import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  invalidateQueries: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.useQuery,
  useMutation: mocks.useMutation,
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}))

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

import { api } from '@/lib/api'
import { taxonomyJobsParams } from '@/lib/jobs-taxonomy-filters'
import {
  useActivity,
  useAnalytics,
  useCertifications,
  useCompanies,
  useCompany,
  useCreateContact,
  useCreateJob,
  useCreateResumeVersion,
  useCreateUserSkill,
  useDeleteContact,
  useDeleteJob,
  useDeleteResumeVersion,
  useDeleteUserSkill,
  useJob,
  useJobs,
  usePatchCompany,
  usePatchContact,
  usePatchJob,
  usePatchResumeVersion,
  useResumeVersions,
  useSkills,
  useSoftware,
  useStats,
  useTagLookup,
  useTagLookupByIds,
  useTaxonomyAnalytics,
  useTaxonomyClearanceComparison,
  useUserSkills,
  useUserTaxonomies,
  useUserTaxonomyGap,
  useCreateUserTaxonomy,
  usePatchUserTaxonomy,
  useDeleteUserTaxonomy,
} from '@/lib/queries'

// The mocked useQuery/useMutation return the hook's config object verbatim,
// so tests can call queryFn/mutationFn directly. The hooks' declared return
// types (UseQueryResult/UseMutationResult) don't expose those, so cast the
// result back to the config shape the mock actually returns.
type QueryConfig = {
  queryKey: readonly unknown[]
  queryFn: () => Promise<unknown>
}

type MutationConfig<TVariables> = {
  mutationFn: (variables: TVariables) => Promise<unknown>
  onSuccess: (data: unknown, variables: TVariables) => void
}

function asQueryConfig(hookResult: unknown): QueryConfig {
  return hookResult as QueryConfig
}

function asMutationConfig<TVariables>(hookResult: unknown): MutationConfig<TVariables> {
  return hookResult as MutationConfig<TVariables>
}

describe('query hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useQuery.mockImplementation((config) => config)
    mocks.useMutation.mockImplementation((config) => config)
  })

  it('serializes every supported jobs filter into the API query string', async () => {
    const query = asQueryConfig(useJobs({
      page: 2,
      company_id: 42,
      q: 'react engineer',
      stage: 'applied',
      platform: 'linkedin',
      job_type: 'full_time',
      experience_level: 'senior',
      security_clearance: 'true',
      is_remote: 'false',
      is_active: 'false',
      skill_ids: '1,2,3',
      software_ids: '4,5',
      certification_ids: '6',
      keyword_ids: '7,8',
      salary_min: 9000000,
      salary_max: 15000000,
      priority_min: 3,
    }))

    await query.queryFn()

    const path = vi.mocked(api.get).mock.calls[0][0] as string
    const params = new URLSearchParams(path.split('?')[1])

    expect(path.split('?')[0]).toBe('/jobs')
    expect(params.get('page')).toBe('2')
    expect(params.get('company_id')).toBe('42')
    expect(params.get('q')).toBe('react engineer')
    expect(params.get('stage')).toBe('applied')
    expect(params.get('platform')).toBe('linkedin')
    expect(params.get('job_type')).toBe('full_time')
    expect(params.get('experience_level')).toBe('senior')
    expect(params.get('security_clearance')).toBe('true')
    expect(params.get('is_remote')).toBe('false')
    expect(params.get('is_active')).toBe('false')
    expect(params.get('skill_ids')).toBe('1,2,3')
    expect(params.get('software_ids')).toBe('4,5')
    expect(params.get('certification_ids')).toBe('6')
    expect(params.get('keyword_ids')).toBe('7,8')
    expect(params.get('salary_min')).toBe('9000000')
    expect(params.get('salary_max')).toBe('15000000')
    expect(params.get('priority_min')).toBe('3')
  })

  it.each([
    ['useCompanies', () => useCompanies(), '/companies'],
    ['useCompany', () => useCompany(7), '/companies/7'],
    ['useJob', () => useJob('42'), '/jobs/42'],
    ['useStats', () => useStats(), '/stats'],
    ['useActivity', () => useActivity(), '/activity'],
    ['useResumeVersions', () => useResumeVersions(), '/resume-versions'],
    ['useSkills', () => useSkills(), '/skills'],
    ['useUserSkills', () => useUserSkills(), '/user-skills'],
    ['useUserTaxonomies', () => useUserTaxonomies('certifications'), '/user-taxonomies/certifications'],
    ['useUserTaxonomyGap', () => useUserTaxonomyGap('keywords'), '/user-taxonomies/keywords/gap?limit=100'],
    ['useSoftware', () => useSoftware(), '/software'],
    ['useCertifications', () => useCertifications(), '/certifications'],
  ])('%s calls the expected read endpoint', async (_name, makeQuery, endpoint) => {
    const query = asQueryConfig(makeQuery())

    await query.queryFn()

    expect(api.get).toHaveBeenCalledWith(endpoint)
  })

  it('preserves false analytics filters when building the API query string', async () => {
    const query = asQueryConfig(useAnalytics({ from: '2026-01-01', to: '2026-02-01', security_clearance: false }))

    await query.queryFn()

    expect(api.get).toHaveBeenCalledWith('/analytics?from=2026-01-01&to=2026-02-01&security_clearance=false')
  })

  it('sends a category-specific search query to reach tags beyond the initial 20 results', async () => {
    const query = asQueryConfig(useTagLookup('skills', '  Zymurgy  '))

    await query.queryFn()

    expect(query.queryKey).toEqual(['tags', 'skills', 'Zymurgy'])
    expect(api.get).toHaveBeenCalledWith('/tags?type=skills&q=Zymurgy')
  })

  it('omits malformed and over-limit taxonomy URL state from the jobs API call', async () => {
    const params = new URLSearchParams({
      skill_ids: 'abc',
      certification_ids: Array.from({ length: 101 }, (_, index) => index + 1).join(','),
      software_ids: '7, 4,7',
    })
    const query = asQueryConfig(useJobs(taxonomyJobsParams(params)))

    await query.queryFn()

    const path = vi.mocked(api.get).mock.calls[0][0] as string
    const calledParams = new URLSearchParams(path.split('?')[1])
    expect(calledParams.has('skill_ids')).toBe(false)
    expect(calledParams.has('certification_ids')).toBe(false)
    expect(calledParams.get('software_ids')).toBe('7,4')
  })

  it('loads selected taxonomy names by canonical IDs for URL restoration', async () => {
    const query = asQueryConfig(useTagLookupByIds('skills', [99, 4, 99]))

    await query.queryFn()

    expect(query.queryKey).toEqual(['tags', 'skills', 'ids', '4,99'])
    expect(api.get).toHaveBeenCalledWith('/tags?type=skills&ids=4%2C99')
  })

  it('writes profile metadata through category-owned routes and refreshes profile and gap data', async () => {
    const create = asMutationConfig<{
      category: 'software'
      body: { name: string; familiarity: 'learning' }
    }>(useCreateUserTaxonomy())
    await create.mutationFn({ category: 'software', body: { name: 'Kubernetes', familiarity: 'learning' } })
    create.onSuccess(undefined, { category: 'software', body: { name: 'Kubernetes', familiarity: 'learning' } })
    expect(api.post).toHaveBeenCalledWith('/user-taxonomies/software', {
      name: 'Kubernetes',
      familiarity: 'learning',
    })
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['user-taxonomies', 'software'] })
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['user-taxonomies', 'software', 'gap'] })

    const patch = asMutationConfig<{
      category: 'keywords'
      taxonomyId: number
      body: { preference: 'exclusion' }
    }>(usePatchUserTaxonomy())
    await patch.mutationFn({ category: 'keywords', taxonomyId: 4, body: { preference: 'exclusion' } })
    patch.onSuccess(undefined, { category: 'keywords', taxonomyId: 4, body: { preference: 'exclusion' } })
    expect(api.patch).toHaveBeenCalledWith('/user-taxonomies/keywords/4', { preference: 'exclusion' })

    const remove = asMutationConfig<{ category: 'certifications'; taxonomyId: number }>(useDeleteUserTaxonomy())
    await remove.mutationFn({ category: 'certifications', taxonomyId: 7 })
    remove.onSuccess(undefined, { category: 'certifications', taxonomyId: 7 })
    expect(api.delete).toHaveBeenCalledWith('/user-taxonomies/certifications/7')
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['user-taxonomies', 'certifications', 'gap'],
    })
  })

  it('serializes the category-safe taxonomy analytics contract', async () => {
    const query = asQueryConfig(useTaxonomyAnalytics({
      category: 'software',
      compare: 'clearance',
      limit: 20,
      from: '2026-01-01',
      to: '2026-02-01',
      platform: 'linkedin',
    }))

    await query.queryFn()

    expect(api.get).toHaveBeenCalledWith(
      '/analytics/taxonomy?category=software&compare=clearance&limit=20&from=2026-01-01&to=2026-02-01&platform=linkedin',
    )
  })

  it('uses the legacy skills comparison endpoint and normalizes skill names', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      clearance_required: [{ skill: 'Python', count: 2, percentage: 50 }],
      clearance_not_required: [],
    })
    const query = asQueryConfig(useTaxonomyClearanceComparison('skills'))

    await expect(query.queryFn()).resolves.toEqual({
      clearance_required: [{ name: 'Python', count: 2, percentage: 50 }],
      clearance_not_required: [],
    })
    expect(api.get).toHaveBeenCalledWith('/analytics/skills-by-clearance')
  })

  it('uses category-safe comparison analytics for non-skill taxonomies', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      category: 'software',
      percentage_denominator: 'assignments',
      clearance_required: [],
      clearance_not_required: [],
    })
    const query = asQueryConfig(useTaxonomyClearanceComparison('software'))

    await query.queryFn()

    expect(api.get).toHaveBeenCalledWith('/analytics/taxonomy?category=software&compare=clearance&limit=15')
  })

  it('invalidates both the list and detail queries after a job delete succeeds', async () => {
    const mutation = asMutationConfig<{ id: number }>(useDeleteJob())

    await mutation.mutationFn({ id: 42 })
    mutation.onSuccess(undefined, { id: 42 })

    expect(api.delete).toHaveBeenCalledWith('/jobs/42')
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['jobs'] })
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['job', '42'] })
  })

  it.each([
    ['useCreateJob', () => useCreateJob(), { title: 'Engineer' }, 'post', '/jobs', { title: 'Engineer' }, [['jobs']]],
    ['usePatchCompany', () => usePatchCompany(), { id: 7, name: 'Acme' }, 'patch', '/companies/7', { name: 'Acme' }, [['companies'], ['companies', 7]]],
    ['usePatchJob', () => usePatchJob(), { id: 42, body: { job_title: 'Senior Engineer' } }, 'patch', '/jobs/42', { job_title: 'Senior Engineer' }, [['job', '42'], ['jobs']]],
    ['useCreateContact', () => useCreateContact(), { jobId: 42, body: { name: 'Ada' } }, 'post', '/jobs/42/contacts', { name: 'Ada' }, [['job', '42']]],
    ['usePatchContact', () => usePatchContact(), { jobId: 42, contactId: 3, body: { title: 'Recruiter' } }, 'patch', '/jobs/42/contacts/3', { title: 'Recruiter' }, [['job', '42']]],
    ['useDeleteContact', () => useDeleteContact(), { jobId: 42, contactId: 3 }, 'delete', '/jobs/42/contacts/3', undefined, [['job', '42']]],
    ['useCreateResumeVersion', () => useCreateResumeVersion(), { label: 'Backend' }, 'post', '/resume-versions', { label: 'Backend' }, [['resume-versions']]],
    ['usePatchResumeVersion', () => usePatchResumeVersion(), { id: 5, body: { notes: 'Updated' } }, 'patch', '/resume-versions/5', { notes: 'Updated' }, [['resume-versions']]],
    ['useDeleteResumeVersion', () => useDeleteResumeVersion(), 5, 'delete', '/resume-versions/5', undefined, [['resume-versions']]],
    ['useCreateUserSkill', () => useCreateUserSkill(), { name: 'TypeScript' }, 'post', '/user-skills', { name: 'TypeScript' }, [['user-skills'], ['skills']]],
    ['useDeleteUserSkill', () => useDeleteUserSkill(), 8, 'delete', '/user-skills/8', undefined, [['user-skills'], ['skills']]],
  ])('%s writes through the expected endpoint and invalidates dependent queries', async (
    _name,
    makeMutation,
    variables,
    method,
    endpoint,
    body,
    invalidations,
  ) => {
    const mutation = asMutationConfig(makeMutation())

    await mutation.mutationFn(variables)
    mutation.onSuccess(undefined, variables)

    if (body === undefined) {
      expect(api[method as 'delete']).toHaveBeenCalledWith(endpoint)
    } else {
      expect(api[method as 'post' | 'patch']).toHaveBeenCalledWith(endpoint, body)
    }
    for (const queryKey of invalidations) {
      expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey })
    }
  })
})
