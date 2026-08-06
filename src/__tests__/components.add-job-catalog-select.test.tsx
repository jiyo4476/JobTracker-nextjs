// @vitest-environment happy-dom

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JobListItem, JobsResponse } from '@/types/queries'

// PAGE-017 slice 2 — `/jobs/new` is catalog search/select → `Save to My Jobs`.
// The old manual-create form published a private listing into the shared catalog; it is
// gone, and catalog creation is an admin-only affordance pointing at /admin/jobs/new.

const mocks = vi.hoisted(() => ({
  useJobs: vi.fn(),
  useIsAdmin: vi.fn(() => false),
  stateAction: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false },
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))
vi.mock('@/lib/queries', () => ({
  useJobs: mocks.useJobs,
  useIsAdmin: mocks.useIsAdmin,
  useJobStateAction: () => mocks.stateAction,
}))

import AddJobPage from '@/app/jobs/new/page'

function makeItem(overrides: Partial<JobListItem> = {}): JobListItem {
  return {
    id: 1, jobTitle: 'Engineer', jobLink: null, jobLocation: 'Austin', isRemote: false,
    sourcePlatform: null, jobType: null, experienceLevel: null, salaryMin: null, salaryMax: null,
    salaryType: null, hourlyRateMin: null, hourlyRateMax: null, annualEquivalentMin: null,
    annualEquivalentMax: null, salaryText: null, datePosted: null, dateFound: '2026-08-01',
    isActive: true, securityClearanceReq: null, companyId: null, companyName: 'Acme',
    createdAt: '2026-08-01T00:00:00.000Z',
    isTracked: false, isHidden: false, hasApplied: null, dateApplied: null, heardBack: null,
    interviewStage: null, priority: null, ...overrides,
  }
}

function response(jobs: JobListItem[]): JobsResponse {
  return { jobs, scope: 'catalog', total: jobs.length, page: 1, totalPages: 1 }
}

describe('AddJobPage — catalog search/select', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useIsAdmin.mockReturnValue(false)
    mocks.useJobs.mockReturnValue({ data: response([makeItem()]), isLoading: false })
  })

  it('reads the shared catalog scope rather than the personal tracker', () => {
    renderToStaticMarkup(<AddJobPage />)

    expect(mocks.useJobs).toHaveBeenCalledWith({ scope: 'catalog', q: '' })
  })

  it('offers Save to My Jobs and no manual catalog-publishing form', () => {
    const html = renderToStaticMarkup(<AddJobPage />)

    expect(html).toContain('aria-label="Save Engineer to My Jobs"')
    expect(html).toContain('Search the catalog')
    // The removed manual-create affordances must not come back.
    expect(html).not.toContain('Save Job')
    expect(html).not.toContain('Private notes')
  })

  it('hides Create catalog job from non-admins', () => {
    const html = renderToStaticMarkup(<AddJobPage />)

    expect(html).not.toContain('Create catalog job')
    expect(html).not.toContain('/admin/jobs/new')
  })

  it('offers Create catalog job to verified admins', () => {
    mocks.useIsAdmin.mockReturnValue(true)

    const html = renderToStaticMarkup(<AddJobPage />)

    expect(html).toContain('Create catalog job')
    expect(html).toContain('href="/admin/jobs/new"')
  })

  it('marks an already-tracked posting instead of offering a duplicate save', () => {
    mocks.useJobs.mockReturnValue({
      data: response([makeItem({ isTracked: true })]),
      isLoading: false,
    })

    const html = renderToStaticMarkup(<AddJobPage />)

    expect(html).toContain('Already in My Jobs')
    expect(html).not.toContain('aria-label="Save Engineer to My Jobs"')
  })

  it('saves the selected posting to the personal tracker', async () => {
    const user = userEvent.setup()
    render(<AddJobPage />)

    await user.click(screen.getByRole('button', { name: 'Save Engineer to My Jobs' }))

    expect(mocks.stateAction.mutate).toHaveBeenCalledWith({ id: 1, action: 'save' })
  })

  it('debounces the search term before requerying the catalog', () => {
    vi.useFakeTimers()
    try {
      const { unmount } = render(<AddJobPage />)
      mocks.useJobs.mockClear()

      fireEvent.change(screen.getByLabelText('Search the catalog'), {
        target: { value: 'plat' },
      })
      expect(mocks.useJobs.mock.calls.every(([params]) => params.q === '')).toBe(true)

      act(() => { vi.advanceTimersByTime(300) })
      expect(mocks.useJobs).toHaveBeenLastCalledWith({ scope: 'catalog', q: 'plat' })

      unmount()
    } finally {
      vi.useRealTimers()
    }
  })
})
