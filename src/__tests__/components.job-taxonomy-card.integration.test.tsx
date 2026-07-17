// @vitest-environment happy-dom

import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JobDetail, TagsPatchResponse } from '@/types/queries'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  api: {
    get: mocks.get,
    patch: mocks.patch,
  },
}))

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}))

import { JobTaxonomyCard } from '@/components/jobs/JobTaxonomyCard'
import { useJob } from '@/lib/queries'

function makeJob(overrides: Partial<JobDetail> = {}): JobDetail {
  return {
    id: 7,
    jobTitle: 'Platform Engineer',
    jobLink: null,
    jobLocation: null,
    isRemote: null,
    sourcePlatform: null,
    externalJobId: null,
    jobType: null,
    experienceLevel: null,
    jobDescription: null,
    salaryType: null,
    salaryMin: null,
    salaryMax: null,
    hourlyRateMin: null,
    hourlyRateMax: null,
    annualEquivalentMin: null,
    annualEquivalentMax: null,
    salaryText: null,
    salaryCurrency: null,
    hasApplied: null,
    dateApplied: null,
    heardBack: null,
    interviewStage: null,
    datePosted: null,
    dateFound: null,
    lastScrapedAt: null,
    isActive: null,
    applicationDeadline: null,
    securityClearanceReq: null,
    priority: null,
    referral: null,
    coverLetterSubmitted: null,
    resumeVersion: null,
    rejectionReason: null,
    notes: null,
    createdAt: '2026-07-17T00:00:00.000Z',
    updatedAt: '2026-07-17T00:00:00.000Z',
    companyId: null,
    companyName: null,
    skills: [{ id: 1, name: 'Python' }],
    software: [{ id: 2, name: 'Docker' }],
    certifications: [{ id: 3, name: 'CISSP' }],
    keywords: [{ id: 4, name: 'Remote' }],
    contacts: [],
    ...overrides,
  }
}

function responseFromJob(job: JobDetail): TagsPatchResponse {
  return {
    skills: job.skills,
    software: job.software,
    certifications: job.certifications,
    keywords: job.keywords,
    counts: {
      skills: job.skills.length,
      software: job.software.length,
      certifications: job.certifications.length,
      keywords: job.keywords.length,
    },
  }
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  })
}

function JobHarness() {
  const { data: job } = useJob('7')
  if (!job) return <p>Loading job…</p>
  return <JobTaxonomyCard jobId="7" job={job} mode="form" />
}

describe('JobTaxonomyCard integration', () => {
  let serverJob: JobDetail

  beforeEach(() => {
    vi.clearAllMocks()
    serverJob = makeJob()
    mocks.get.mockImplementation(async (path: string) => {
      if (path === '/jobs/7') return serverJob
      if (path.startsWith('/tags?')) return []
      throw new Error(`Unexpected GET ${path}`)
    })
    mocks.patch.mockImplementation(async (path: string, body: Record<string, string[]>) => {
      if (path !== '/jobs/7/tags') throw new Error(`Unexpected PATCH ${path}`)
      serverJob = makeJob({
        skills: body.skills.map((name, index) => ({ id: 100 + index, name })),
        software: body.software.map((name, index) => ({ id: 200 + index, name })),
        certifications: body.certifications.map((name, index) => ({ id: 300 + index, name })),
        keywords: body.keywords.map((name, index) => ({ id: 400 + index, name })),
      })
      return responseFromJob(serverJob)
    })
  })

  it('runs the real mutation hook, invalidates the job cache, and survives the refetch', async () => {
    const user = userEvent.setup()
    const queryClient = createQueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    render(
      <QueryClientProvider client={queryClient}>
        <JobHarness />
      </QueryClientProvider>,
    )

    await user.click(await screen.findByRole('button', { name: 'Remove Python from Skills' }))
    await user.type(screen.getByRole('combobox', { name: 'Search or add skills' }), 'TypeScript{enter}')
    await user.click(screen.getByRole('button', { name: 'Save categories' }))

    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1))
    await waitFor(() => {
      expect(mocks.get.mock.calls.filter(([path]) => path === '/jobs/7')).toHaveLength(2)
    })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['job', '7'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['jobs'] })
    expect(screen.getByRole('button', { name: 'Remove TypeScript from Skills' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Remove Python from Skills' })).toBeNull()
    expect(queryClient.getQueryData<JobDetail>(['job', '7'])?.skills).toEqual([
      { id: 100, name: 'TypeScript' },
    ])
  })

  it('keeps taxonomy Enter and Save actions from submitting the parent edit form', async () => {
    const user = userEvent.setup()
    const queryClient = createQueryClient()
    const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => event.preventDefault())

    render(
      <QueryClientProvider client={queryClient}>
        <form onSubmit={onSubmit}>
          <JobTaxonomyCard jobId="7" job={makeJob()} mode="form" />
          <button type="submit">Save basic info</button>
        </form>
      </QueryClientProvider>,
    )

    const keywordInput = screen.getByRole('combobox', { name: 'Search or add keywords' })
    await user.type(keywordInput, 'Hybrid{enter}')
    expect(onSubmit).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Save categories' }))
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1))
    expect(onSubmit).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Save basic info' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})
