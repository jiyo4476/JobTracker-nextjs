// @vitest-environment happy-dom

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JobListItem, JobsResponse } from '@/types/queries'

const mocks = vi.hoisted(() => ({
  useJobs: vi.fn(),
  searchParams: new URLSearchParams(),
  patchState: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false },
  stateAction: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false },
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => mocks.searchParams,
  useRouter: () => ({ replace: vi.fn() }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))
vi.mock('@/components/jobs/TaxonomyFilters', () => ({ TaxonomyFilters: () => <div /> }))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }))
vi.mock('@/lib/queries', () => ({
  useJobs: mocks.useJobs,
  usePatchJobState: () => mocks.patchState,
  useJobStateAction: () => mocks.stateAction,
}))

import JobsClient from '@/app/jobs/JobsClient'

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

function response(jobs: JobListItem[], scope: JobsResponse['scope']): JobsResponse {
  return { jobs, scope, total: jobs.length, page: 1, totalPages: 1 }
}

describe('JobsClient — owner-scoped views', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the three view tabs as an accessible tablist', () => {
    mocks.searchParams = new URLSearchParams()
    mocks.useJobs.mockReturnValue({ data: response([makeItem({ isTracked: true, interviewStage: 'applied' })], 'tracked'), isLoading: false })
    const html = renderToStaticMarkup(<JobsClient />)
    expect(html).toContain('role="tablist"')
    expect(html).toContain('My Jobs')
    expect(html).toContain('Browse Catalog')
    expect(html).toContain('Hidden')
    // Personal filter group present in the tracked view
    expect(html).toContain('My application')
    expect(html).toContain('Filter by interview stage')
  })

  it('shows "Not tracked" instead of a fake stage and a Save action in the catalog view', () => {
    mocks.searchParams = new URLSearchParams('scope=catalog')
    mocks.useJobs.mockReturnValue({ data: response([makeItem({ id: 9, isTracked: false })], 'catalog'), isLoading: false })
    const html = renderToStaticMarkup(<JobsClient />)
    expect(html).toContain('Not tracked')
    expect(html).toContain('Save') // "Save to My Jobs" action
    // Personal stage filter hidden in catalog scope
    expect(html).not.toContain('Filter by interview stage')
  })

  it('offers Hide + Remove for a tracked row', () => {
    mocks.searchParams = new URLSearchParams()
    mocks.useJobs.mockReturnValue({ data: response([makeItem({ id: 3, isTracked: true, isHidden: false, interviewStage: 'applied' })], 'tracked'), isLoading: false })
    const html = renderToStaticMarkup(<JobsClient />)
    expect(html).toContain('aria-label="Hide Engineer"')
    expect(html).toContain('aria-label="Remove Engineer from My Jobs"')
  })

  it('requires catalog-only selections to be saved before personal bulk actions', async () => {
    const user = userEvent.setup()
    mocks.searchParams = new URLSearchParams('scope=catalog')
    mocks.useJobs.mockReturnValue({
      data: response([makeItem({ id: 9, isTracked: false })], 'catalog'),
      isLoading: false,
    })

    render(<JobsClient />)
    await user.click(screen.getByRole('checkbox', { name: 'Select row' }))

    expect(screen.getByText('1 not tracked — save it to My Jobs first')).toBeTruthy()
    expect(screen.queryByRole('combobox', { name: /Change stage/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Remove .* from My Jobs/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Save Engineer to My Jobs' })).toBeTruthy()
  })

  it('limits mixed catalog personal bulk actions to tracked selected rows', async () => {
    const user = userEvent.setup()
    mocks.stateAction.mutateAsync.mockResolvedValue({})
    mocks.searchParams = new URLSearchParams('scope=catalog')
    mocks.useJobs.mockReturnValue({
      data: response([
        makeItem({ id: 3, jobTitle: 'Tracked Engineer', isTracked: true }),
        makeItem({ id: 9, jobTitle: 'Catalog Engineer', isTracked: false }),
      ], 'catalog'),
      isLoading: false,
    })

    render(<JobsClient />)
    const table = screen.getByRole('tabpanel')
    await user.click(within(table).getByRole('checkbox', { name: 'Select all' }))

    expect(screen.getByText('2 selected')).toBeTruthy()
    expect(screen.getByText('1 not tracked — save it to My Jobs first')).toBeTruthy()
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Change stage for 1 tracked selected job' }),
      'applied'
    )
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(mocks.patchState.mutateAsync).toHaveBeenCalledTimes(1)
    expect(mocks.patchState.mutateAsync).toHaveBeenCalledWith({
      id: 3,
      body: { interview_stage: 'applied' },
    })

    // Re-select the tracked row after a successful bulk stage update clears it.
    await user.click(within(table).getAllByRole('checkbox', { name: 'Select row' })[0])
    await user.click(screen.getByRole('button', { name: 'Remove 1 from My Jobs' }))
    await user.click(screen.getByRole('button', { name: 'Remove 1' }))

    expect(mocks.stateAction.mutateAsync).toHaveBeenCalledTimes(1)
    expect(mocks.stateAction.mutateAsync).toHaveBeenCalledWith({ id: 3, action: 'remove' })
  })
})
