import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JobDetail } from '@/types/queries'

const mocks = vi.hoisted(() => ({
  useJob: vi.fn(),
  patchState: vi.fn(),
  removeAction: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '5' }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))
vi.mock('@/components/jobs/JobDescriptionMarkdown', () => ({
  JobDescriptionMarkdown: ({ children }: { children: string }) => <div>{children}</div>,
}))
vi.mock('@/lib/queries', () => ({
  useJob: mocks.useJob,
  usePatchJobState: () => ({ mutate: mocks.patchState, isPending: false }),
  useJobStateAction: () => ({ mutate: mocks.removeAction, isPending: false }),
  useResumeVersions: () => ({ data: [{ id: 1, label: 'v1-swe' }] }),
  useCreateContact: () => ({ mutate: vi.fn(), isPending: false }),
  usePatchContact: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteContact: () => ({ mutate: vi.fn(), isPending: false }),
}))

import JobDetailPage from '@/app/jobs/[id]/page'

function makeJob(overrides: Partial<JobDetail> = {}): JobDetail {
  return {
    id: 5,
    jobTitle: 'Platform Engineer',
    jobLink: 'https://example.com/job',
    jobLocation: 'Remote',
    isRemote: true,
    sourcePlatform: 'linkedin',
    externalJobId: null,
    jobType: null,
    experienceLevel: null,
    jobDescription: 'Build platforms.',
    salaryType: null,
    salaryMin: null,
    salaryMax: null,
    hourlyRateMin: null,
    hourlyRateMax: null,
    annualEquivalentMin: null,
    annualEquivalentMax: null,
    salaryText: null,
    salaryCurrency: null,
    datePosted: null,
    dateFound: '2026-08-01',
    lastScrapedAt: null,
    isActive: true,
    applicationDeadline: null,
    securityClearanceReq: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    companyId: null,
    companyName: 'Acme',
    hasApplied: null,
    dateApplied: null,
    heardBack: null,
    interviewStage: null,
    priority: null,
    referral: null,
    coverLetterSubmitted: null,
    rejectionReason: null,
    notes: null,
    isTracked: false,
    isHidden: false,
    userState: null,
    selectedResume: null,
    skills: [{ id: 1, name: 'Kubernetes' }],
    software: [],
    keywords: [],
    certifications: [],
    contacts: [],
    ...overrides,
  }
}

describe('JobDetailPage — posting/application split', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows a read-only Job posting section and a Not-tracked empty state for untracked jobs', () => {
    mocks.useJob.mockReturnValue({ data: makeJob(), isLoading: false })
    const html = renderToStaticMarkup(<JobDetailPage />)

    expect(html).toContain('Job posting')
    expect(html).toContain('Shared catalog details')
    expect(html).toContain('Kubernetes') // catalog tag rendered read-only
    expect(html).toContain('Not tracked')
    expect(html).toContain('You are not tracking this job yet.')
    expect(html).toContain('Save to My Jobs')
    // No personal editor fields until tracked
    expect(html).not.toContain('Private notes')
  })

  it('renders the My application editor and My contacts when the job is tracked', () => {
    mocks.useJob.mockReturnValue({
      data: makeJob({
        isTracked: true,
        interviewStage: 'applied',
        userState: {
          priority: 3, isHidden: false, hasApplied: true, dateApplied: '2026-08-02', heardBack: false,
          interviewStage: 'applied', referral: false, coverLetterSubmitted: false, resumeVersionId: 1,
          rejectionReason: null, notes: 'call recruiter', createdAt: 'x', updatedAt: 'y',
        },
      }),
      isLoading: false,
    })
    const html = renderToStaticMarkup(<JobDetailPage />)

    expect(html).toContain('My application')
    expect(html).toContain('Interview stage')
    expect(html).toContain('Private notes')
    expect(html).toContain('call recruiter')
    expect(html).toContain('My contacts')
    expect(html).toContain('Saved to My Jobs')
    expect(html).toContain('Remove')
  })
})
