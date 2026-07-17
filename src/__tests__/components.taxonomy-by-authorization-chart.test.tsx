// @vitest-environment happy-dom

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useComparison: vi.fn(),
  refetch: vi.fn(),
  routerReplace: vi.fn((href: string) => window.history.replaceState({}, '', href)),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ replace: mocks.routerReplace }),
}))

vi.mock('@/lib/queries', () => ({
  useTaxonomyClearanceComparison: mocks.useComparison,
}))

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => <div data-testid="bar" />,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}))

import {
  TaxonomyByAuthorizationChart,
  TaxonomyChartTooltip,
} from '@/components/dashboard/TaxonomyByAuthorizationChart'

const data = {
  clearance_required: [
    { name: 'Python', count: 10, percentage: 50 },
    { name: 'AWS', count: 8, percentage: 40 },
    { name: 'Docker', count: 5, percentage: 25 },
  ],
  clearance_not_required: [
    { name: 'React', count: 12, percentage: 60 },
    { name: 'Python', count: 4, percentage: 5 },
    { name: 'AWS', count: 3, percentage: 4 },
    { name: 'Docker', count: 2, percentage: 2 },
  ],
}

describe('TaxonomyByAuthorizationChart', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState({}, '', '/')
    mocks.useComparison.mockReturnValue({ data, isLoading: false, isError: false, refetch: mocks.refetch })
  })

  it('renders separate clearance charts, selector state, and category insight', () => {
    render(<TaxonomyByAuthorizationChart />)

    expect(screen.getByRole('heading', { name: 'Top 15 Skills — Clearance Required' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Top 15 Skills — No Clearance' })).toBeTruthy()
    expect(screen.getAllByTestId('bar')).toHaveLength(2)
    expect(screen.getByText(/Python, AWS, Docker/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Skills' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('restores and persists a valid category in the URL', async () => {
    window.history.replaceState({}, '', '/?taxonomy=certifications')
    const view = render(<TaxonomyByAuthorizationChart />)

    await waitFor(() => expect(mocks.useComparison).toHaveBeenLastCalledWith('certifications'))
    fireEvent.click(screen.getByRole('button', { name: 'Software' }))
    view.rerender(<TaxonomyByAuthorizationChart />)

    expect(new URLSearchParams(window.location.search).get('taxonomy')).toBe('software')
    expect(screen.getByRole('heading', { name: 'Top 15 Software — Clearance Required' })).toBeTruthy()
  })

  it('derives the active category from URL changes after mount', () => {
    const view = render(<TaxonomyByAuthorizationChart />)
    expect(mocks.useComparison).toHaveBeenLastCalledWith('skills')

    window.history.replaceState({}, '', '/?taxonomy=keywords')
    view.rerender(<TaxonomyByAuthorizationChart />)

    expect(mocks.useComparison).toHaveBeenLastCalledWith('keywords')
    expect(screen.getByRole('heading', { name: 'Top 15 Keywords — Clearance Required' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Keywords' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('only calls out values that are more prevalent in clearance roles', () => {
    mocks.useComparison.mockReturnValue({
      data: {
        clearance_required: [
          { name: 'Python', count: 100, percentage: 10 },
          { name: 'CISSP', count: 30, percentage: 30 },
        ],
        clearance_not_required: [
          { name: 'Python', count: 200, percentage: 20 },
          { name: 'CISSP', count: 10, percentage: 5 },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: mocks.refetch,
    })

    render(<TaxonomyByAuthorizationChart />)

    const insight = screen.getByText(/Clearance roles tend to emphasize/)
    expect(insight.textContent).toContain('CISSP')
    expect(insight.textContent).not.toContain('Python')
  })

  it('does not infer zero prevalence for values missing beyond the other top-15 cutoff', () => {
    mocks.useComparison.mockReturnValue({
      data: {
        clearance_required: [
          { name: 'Outside other top 15', count: 50, percentage: 40 },
          { name: 'Shared value', count: 20, percentage: 20 },
        ],
        clearance_not_required: [
          { name: 'Shared value', count: 10, percentage: 10 },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: mocks.refetch,
    })

    render(<TaxonomyByAuthorizationChart />)

    const insight = screen.getByText(/Clearance roles tend to emphasize/)
    expect(insight.textContent).toContain('Shared value')
    expect(insight.textContent).not.toContain('Outside other top 15')
  })

  it('renders tooltip taxonomy name, count, and percentage', () => {
    render(<TaxonomyChartTooltip
      active
      label="TypeScript"
      payload={[{ value: 1234, payload: { name: 'TypeScript', count: 1234, percentage: 12.34 } }]}
    />)

    expect(screen.getByText('TypeScript')).toBeTruthy()
    expect(screen.getByText('1,234 jobs (12.3%)')).toBeTruthy()
  })

  it('shows loading and retryable error states', () => {
    mocks.useComparison.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: mocks.refetch })
    const view = render(<TaxonomyByAuthorizationChart />)
    expect(screen.getByLabelText('Loading taxonomy comparison charts')).toBeTruthy()

    mocks.useComparison.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: mocks.refetch })
    view.rerender(<TaxonomyByAuthorizationChart />)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(mocks.refetch).toHaveBeenCalledOnce()
  })
})
