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

import { TaxonomyByAuthorizationChart } from '@/components/dashboard/TaxonomyByAuthorizationChart'

const data = {
  clearance_required: [
    { name: 'Python', count: 10, percentage: 50 },
    { name: 'AWS', count: 8, percentage: 40 },
    { name: 'Docker', count: 5, percentage: 25 },
  ],
  clearance_not_required: [{ name: 'React', count: 12, percentage: 60 }],
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
    render(<TaxonomyByAuthorizationChart />)

    await waitFor(() => expect(mocks.useComparison).toHaveBeenLastCalledWith('certifications'))
    fireEvent.click(screen.getByRole('button', { name: 'Software' }))

    expect(new URLSearchParams(window.location.search).get('taxonomy')).toBe('software')
    expect(screen.getByRole('heading', { name: 'Top 15 Software — Clearance Required' })).toBeTruthy()
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
