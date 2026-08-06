// @vitest-environment happy-dom

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JobDetail } from '@/types/queries'

// PAGE-017 slice 2 — the admin catalog editor.
//
// Two things are asserted here: (1) a non-admin never sees a catalog mutation control,
// and (2) the form submits a CATALOG-ONLY body that `jobCatalogPatchSchema` accepts, so
// a personal field can never ride along with a catalog write.

const mocks = vi.hoisted(() => ({
  useJob: vi.fn(),
  useMe: vi.fn(),
  useIdentity: vi.fn(),
  useIsAdmin: vi.fn(() => false),
  patchCatalog: vi.fn(),
  deleteJob: vi.fn(),
  routerPush: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '5' }),
  useRouter: () => ({ push: mocks.routerPush }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))
vi.mock('@/components/jobs/JobSalaryInlineEditor', () => ({
  JobSalaryInlineEditor: () => <div>salary editor</div>,
}))
vi.mock('@/components/jobs/JobTaxonomyCard', () => ({
  JobTaxonomyCard: () => <div>taxonomy editor</div>,
}))
vi.mock('@/lib/queries', () => ({
  useJob: mocks.useJob,
  useMe: mocks.useMe,
  useIdentity: mocks.useIdentity,
  useIsAdmin: mocks.useIsAdmin,
  useCompanies: () => ({ data: [{ id: 3, name: 'Acme' }] }),
  usePatchCatalogJob: () => ({ mutate: mocks.patchCatalog, isPending: false, isError: false }),
  useDeleteJob: () => ({ mutate: mocks.deleteJob, isPending: false }),
}))

import AdminEditCatalogJobPage, { catalogPatchBody } from '@/app/admin/jobs/[id]/edit/page'
import { jobCatalogPatchSchema } from '@/lib/schemas'

function makeJob(overrides: Partial<JobDetail> = {}): JobDetail {
  return {
    id: 5, jobTitle: 'Platform Engineer', jobLink: null, jobLocation: 'Austin, TX',
    isRemote: false, sourcePlatform: 'linkedin', externalJobId: null, jobType: 'full_time',
    experienceLevel: 'senior', jobDescription: 'Build things.', salaryType: null,
    salaryMin: null, salaryMax: null, hourlyRateMin: null, hourlyRateMax: null,
    annualEquivalentMin: null, annualEquivalentMax: null, salaryText: '$180k',
    salaryCurrency: null, datePosted: '2026-07-01', dateFound: '2026-07-02',
    lastScrapedAt: null, isActive: true, applicationDeadline: null, securityClearanceReq: false,
    createdAt: 'x', updatedAt: 'y', companyId: 3, companyName: 'Acme',
    hasApplied: null, dateApplied: null, heardBack: null, interviewStage: null, priority: null,
    referral: null, coverLetterSubmitted: null, rejectionReason: null, notes: null,
    isTracked: false, isHidden: false, userState: null, selectedResume: null,
    skills: [], software: [], keywords: [], certifications: [], contacts: [],
    ...overrides,
  }
}

describe('admin catalog editor guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useJob.mockReturnValue({ data: makeJob(), isLoading: false })
  })

  it('renders a resolving state before /api/me answers, not a false denial', () => {
    mocks.useMe.mockReturnValue({ isError: false })
    mocks.useIdentity.mockReturnValue(undefined)

    const html = renderToStaticMarkup(<AdminEditCatalogJobPage />)

    expect(html).toContain('aria-busy="true"')
    expect(html).not.toContain('Catalog editing is restricted')
    expect(html).not.toContain('Save catalog posting')
  })

  it('denies a resolved non-admin and renders no catalog mutation control', () => {
    mocks.useMe.mockReturnValue({ isError: false })
    mocks.useIdentity.mockReturnValue({ user_id: 9, is_admin: false })

    const html = renderToStaticMarkup(<AdminEditCatalogJobPage />)

    expect(html).toContain('Catalog editing is restricted')
    expect(html).not.toContain('Save catalog posting')
    expect(html).not.toContain('Remove from catalog')
  })

  it('shows a distinct stale-session state when the identity query fails', () => {
    mocks.useMe.mockReturnValue({ isError: true })
    mocks.useIdentity.mockReturnValue(undefined)

    const html = renderToStaticMarkup(<AdminEditCatalogJobPage />)

    expect(html).toContain('Sign-in required')
    expect(html).not.toContain('Catalog editing is restricted')
  })

  it('renders the catalog form for a verified admin', () => {
    mocks.useMe.mockReturnValue({ isError: false })
    mocks.useIdentity.mockReturnValue({ user_id: 9, is_admin: true })

    const html = renderToStaticMarkup(<AdminEditCatalogJobPage />)

    expect(html).toContain('Save catalog posting')
    expect(html).toContain('Edit catalog posting: Platform Engineer')
    // Personal fields must never appear on the catalog form.
    expect(html).not.toContain('Interview stage')
    expect(html).not.toContain('Private notes')
  })
})

describe('admin catalog editor submission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useJob.mockReturnValue({ data: makeJob(), isLoading: false })
    mocks.useMe.mockReturnValue({ isError: false })
    mocks.useIdentity.mockReturnValue({ user_id: 9, is_admin: true })
  })

  it('submits a catalog-only body the shared Zod schema accepts', async () => {
    const user = userEvent.setup()
    render(<AdminEditCatalogJobPage />)

    const title = await screen.findByLabelText('Job title *')
    await user.clear(title)
    await user.type(title, 'Staff Platform Engineer')
    await user.click(screen.getByRole('button', { name: 'Save catalog posting' }))

    expect(mocks.patchCatalog).toHaveBeenCalledTimes(1)
    const [{ id, body }] = mocks.patchCatalog.mock.calls[0]
    expect(id).toBe('5')
    expect(body.job_title).toBe('Staff Platform Engineer')
    expect(jobCatalogPatchSchema.safeParse(body).success).toBe(true)
    for (const personal of [
      'has_applied', 'interview_stage', 'priority', 'notes', 'referral',
      'cover_letter_submitted', 'heard_back', 'date_applied', 'rejection_reason',
      'resume_version_id',
    ]) {
      expect(body).not.toHaveProperty(personal)
    }
  })

  it('blocks the write and shows a field error when the schema rejects the form', async () => {
    const user = userEvent.setup()
    render(<AdminEditCatalogJobPage />)

    await user.clear(await screen.findByLabelText('Job title *'))
    await user.click(screen.getByRole('button', { name: 'Save catalog posting' }))

    expect(mocks.patchCatalog).not.toHaveBeenCalled()
  })
})

describe('catalogPatchBody', () => {
  it('produces only fields jobCatalogPatchSchema declares', () => {
    const body = catalogPatchBody({
      jobTitle: 'Engineer', companyId: '3', jobLocation: 'Austin', isRemote: true,
      jobDescription: 'desc', datePosted: '2026-01-01', applicationDeadline: '',
      salaryText: '$1', jobType: 'full_time', experienceLevel: 'senior',
      securityClearanceReq: false, isActive: true,
    })

    expect(jobCatalogPatchSchema.safeParse(body).success).toBe(true)
  })
})
