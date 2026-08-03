import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StatsResponse } from '@/types/queries'

const mocks = vi.hoisted(() => ({
  useStats: vi.fn(),
  useActivity: vi.fn(),
}))

vi.mock('@/lib/queries', () => ({
  useStats: mocks.useStats,
  useActivity: mocks.useActivity,
}))

// Recharts needs a real layout to render marks; in SSR we only care that the page
// wires the correct data into each chart. Each primitive echoes its `data` prop as
// JSON so the test can assert which stats fields reached which chart.
vi.mock('recharts', () => {
  const echo = (name: string) => {
    const EchoChart = ({ data, children }: { data?: unknown; children?: React.ReactNode }) => (
      <div data-chart={name} data-series={data ? JSON.stringify(data) : undefined}>
        {children}
      </div>
    )
    EchoChart.displayName = `Echo(${name})`
    return EchoChart
  }
  const passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  passthrough.displayName = 'Passthrough'
  return {
    ResponsiveContainer: passthrough,
    BarChart: echo('bar'),
    LineChart: echo('line'),
    PieChart: passthrough,
    Pie: echo('pie'),
    Bar: passthrough,
    Line: passthrough,
    Cell: passthrough,
    XAxis: passthrough,
    YAxis: passthrough,
    Tooltip: passthrough,
  }
})

vi.mock('@/components/dashboard/TaxonomyByAuthorizationChart', () => ({
  TaxonomyByAuthorizationChart: () => <div data-testid="taxonomy-chart" />,
}))

vi.mock('@/components/jobs/StageBadge', () => ({
  StageBadge: ({ stage }: { stage: string }) => <span>{stage}</span>,
}))

import DashboardPage from '@/app/page'

const stats: StatsResponse = {
  scope: 'personal',
  trackedJobs: 8,
  applied: 5,
  activeInterviews: 2,
  staleListings: 3,
  stageCounts: [
    { stage: 'applied', count: 5 },
    { stage: 'onsite', count: 1 },
  ],
  catalog: {
    totalJobs: 42,
    topSkills: [{ name: 'TypeScript', jobCount: 20 }],
    weeklyJobCounts: [{ week: '2024-01-01T00:00:00.000Z', jobCount: 7 }],
    remoteCount: 30,
    onsiteCount: 12,
  },
}

describe('DashboardPage — API-013 personal/catalog stats contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useActivity.mockReturnValue({ data: [], isLoading: false, isError: false })
  })

  it('renders personal KPIs from the top level (not the global catalog total)', () => {
    mocks.useStats.mockReturnValue({ data: stats, isLoading: false, isError: false })
    const html = renderToStaticMarkup(<DashboardPage />)

    // Personal KPI label + value; the global catalog total (42) must NOT be shown as a KPI.
    expect(html).toContain('Tracked Jobs')
    expect(html).toContain('>8<')
    expect(html).not.toContain('Total Jobs')
  })

  it('sources skills, weekly counts, and remote split from the catalog block', () => {
    mocks.useStats.mockReturnValue({ data: stats, isLoading: false, isError: false })
    const html = renderToStaticMarkup(<DashboardPage />)

    // catalog.topSkills → bar chart
    expect(html).toContain('TypeScript')
    // catalog.weeklyJobCounts → line chart (exercises the .map that previously threw)
    expect(html).toMatch(/data-chart="line"/)
    // Global labeling per PAGE-017
    expect(html).toContain('Global catalog demand across all postings')
    expect(html).toContain('Global catalog intake across all postings')
    expect(html).toContain('Global catalog split across all postings')
  })

  it('feeds the funnel from personal stageCounts', () => {
    mocks.useStats.mockReturnValue({ data: stats, isLoading: false, isError: false })
    const html = renderToStaticMarkup(<DashboardPage />)
    // The funnel BarChart series should carry the personal stage counts.
    expect(html).toContain('&quot;stage&quot;:&quot;applied&quot;')
  })

  it('does not throw while loading (no data yet)', () => {
    mocks.useStats.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    expect(() => renderToStaticMarkup(<DashboardPage />)).not.toThrow()
  })
})
