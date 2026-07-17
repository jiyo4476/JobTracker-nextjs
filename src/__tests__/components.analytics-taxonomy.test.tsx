// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AnalyticsClient } from '@/app/analytics/AnalyticsClient'

const mocks = vi.hoisted(() => ({
  analytics: vi.fn(),
  taxonomy: vi.fn(),
}))

vi.mock('@/lib/queries', () => ({
  useAnalytics: mocks.analytics,
  useTaxonomyAnalytics: mocks.taxonomy,
}))

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => null,
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: () => null,
  PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Pie: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Cell: () => null,
  AreaChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}))

const initialState = { category: 'skills' as const, from: '2026-01-01', to: '', platform: 'linkedin', clearance: '' as const }

describe('analytics taxonomy reporting', () => {
  beforeEach(() => {
    mocks.analytics.mockReturnValue({ data: { skillDemandOverTime: [], salaryDistribution: [], platformBreakdown: [], remoteVsOnsiteByWeek: [] }, isLoading: false, isError: false, refetch: vi.fn() })
    mocks.taxonomy.mockReturnValue({ data: { category: 'skills', percentage_denominator: 'skill assignments', values: [{ name: 'TypeScript', count: 4, percentage: 40 }] }, isLoading: false, isError: false, refetch: vi.fn() })
    window.history.replaceState(null, '', '/analytics')
  })

  it('names the active category throughout the report and exposes a screen-reader summary', () => {
    render(<AnalyticsClient initialState={initialState} />)
    expect(screen.getByRole('heading', { name: 'Top 15 Skills Demand' })).toBeTruthy()
    expect(screen.getByText('Skills demand summary')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Export Skills CSV' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByText(/skill assignments/)).toBeTruthy()
  })

  it('preserves global filter state in the URL and query when changing category by keyboard', async () => {
    const user = userEvent.setup()
    render(<AnalyticsClient initialState={initialState} />)
    const skills = screen.getByRole('tab', { name: 'Skills' })
    skills.focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Software' }).getAttribute('aria-selected')).toBe('true')
    expect(window.location.search).toContain('category=software')
    expect(window.location.search).toContain('from=2026-01-01')
    expect(window.location.search).toContain('platform=linkedin')
    expect(mocks.taxonomy).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'software', from: '2026-01-01', platform: 'linkedin' }))
  })

  it('restores validated report state on browser Back and Forward navigation', async () => {
    render(<AnalyticsClient initialState={initialState} />)
    window.history.pushState(null, '', '/analytics?category=certifications&from=2026-02-01&platform=indeed&security_clearance=false')
    window.dispatchEvent(new PopStateEvent('popstate'))

    await waitFor(() => expect(screen.getByRole('tab', { name: 'Certifications' }).getAttribute('aria-selected')).toBe('true'))
    expect(mocks.taxonomy).toHaveBeenLastCalledWith(expect.objectContaining({
      category: 'certifications',
      from: '2026-02-01',
      platform: 'indeed',
      security_clearance: false,
    }))
  })

  it('applies clearance as a global filter to taxonomy and legacy analytics queries', () => {
    render(<AnalyticsClient initialState={{ ...initialState, clearance: 'true' }} />)
    expect(mocks.taxonomy).toHaveBeenLastCalledWith(expect.objectContaining({ security_clearance: true }))
    expect(mocks.analytics).toHaveBeenLastCalledWith(expect.objectContaining({ security_clearance: true }))
  })

  it('rejects a reversed range created through the live date inputs', () => {
    render(<AnalyticsClient initialState={{
      ...initialState,
      from: '2026-01-01',
      to: '2026-02-01',
    }} />)

    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-03-01' } })

    expect((screen.getByLabelText('From date') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('To date') as HTMLInputElement).value).toBe('')
    expect(window.location.search).not.toContain('from=')
    expect(window.location.search).not.toContain('to=')
    expect(mocks.taxonomy).toHaveBeenLastCalledWith(expect.objectContaining({ from: undefined, to: undefined }))
    expect(mocks.analytics).toHaveBeenLastCalledWith(expect.objectContaining({ from: undefined, to: undefined }))
  })

  it('renders category-specific loading, error, and no-data states', () => {
    mocks.taxonomy.mockReturnValueOnce({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() })
    const loading = render(<AnalyticsClient initialState={{ ...initialState, category: 'certifications' }} />)
    expect(screen.getByLabelText('Loading Certifications report')).toBeTruthy()
    loading.unmount()

    const retry = vi.fn()
    mocks.taxonomy.mockReturnValueOnce({ data: undefined, isLoading: false, isError: true, refetch: retry })
    const error = render(<AnalyticsClient initialState={{ ...initialState, category: 'certifications' }} />)
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(retry).toHaveBeenCalled()
    error.unmount()

    mocks.taxonomy.mockReturnValueOnce({ data: { category: 'keywords', percentage_denominator: 'keyword assignments', values: [] }, isLoading: false, isError: false, refetch: vi.fn() })
    render(<AnalyticsClient initialState={{ ...initialState, category: 'keywords' }} />)
    expect(screen.getByText('No keywords data matches these filters.')).toBeTruthy()
  })
})
