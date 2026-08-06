// @vitest-environment happy-dom

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CompanyDetail, CompanyRow } from '@/types/queries'

// PAGE-017 slice 3 — company and analytics dataset labeling.
//
// The point of these assertions is that a reader can always tell whether a number is
// GLOBAL CATALOG supply or their OWN tracker, and that no view exposes another user's
// applications or contacts.

const mocks = vi.hoisted(() => ({
  useCompanies: vi.fn(),
  useCompany: vi.fn(),
  usePatchCompany: vi.fn(() => ({ mutate: vi.fn() })),
  useAnalytics: vi.fn(),
  useTaxonomyAnalytics: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useParams: () => ({ id: '7' }) }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))
vi.mock('@/lib/queries', () => ({
  useCompanies: mocks.useCompanies,
  useCompany: mocks.useCompany,
  usePatchCompany: mocks.usePatchCompany,
  useAnalytics: mocks.useAnalytics,
  useTaxonomyAnalytics: mocks.useTaxonomyAnalytics,
}))

import CompaniesPage from '@/app/companies/page'
import CompanyDetailPage from '@/app/companies/[id]/page'
import { AnalyticsClient } from '@/app/analytics/AnalyticsClient'

const companyRow: CompanyRow = {
  id: 7, name: 'Acme', website: null, industry: 'Software',
  hqLocation: 'Denver, CO', jobCount: 12, avgSalaryMax: 18000000,
}

function makeCompanyDetail(overrides: Partial<CompanyDetail> = {}): CompanyDetail {
  return {
    ...companyRow,
    sizeRange: null, notes: null, glassdoorUrl: null, linkedinUrl: null,
    jobs: [
      { id: 1, jobTitle: 'Tracked role', interviewStage: 'applied', isTracked: true, salaryMin: null, salaryMax: null, dateFound: '2026-08-01' },
      { id: 2, jobTitle: 'Untracked role', interviewStage: null, isTracked: false, salaryMin: null, salaryMax: null, dateFound: '2026-08-02' },
    ],
    trackedJobCount: 1,
    taxonomyDemand: {
      activeJobCount: 12, skills: [], software: [], certifications: [], keywords: [],
      truncated: { skills: false, software: false, certifications: false, keywords: false },
    },
    ...overrides,
  }
}

describe('companies list dataset labeling', () => {
  beforeEach(() => vi.clearAllMocks())

  it('labels the list as global catalog supply, not a personal tracker', () => {
    mocks.useCompanies.mockReturnValue({ data: [companyRow], isLoading: false })

    const html = renderToStaticMarkup(<CompaniesPage />)

    expect(html).toContain('Global catalog')
    expect(html).toContain('Catalog postings')
    expect(html).toContain('Avg advertised salary')
    // The old ambiguous framing implied these counts were the user's own.
    expect(html).not.toContain('All tracked companies with job counts')
  })
})

describe('company detail dataset separation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('separates global posting demand from my tracked jobs at this company', () => {
    mocks.useCompany.mockReturnValue({ data: makeCompanyDetail(), isLoading: false })

    const html = renderToStaticMarkup(<CompanyDetailPage />)

    expect(html).toContain('Global posting demand')
    expect(html).toContain('My tracked jobs at this company')
    expect(html).toContain('Global catalog')
    expect(html).toContain('My data')
    expect(html).toContain('You track 1 posting at this company.')
    // The catalog list marks tracked-by-me rows without implying a stage for the rest.
    expect(html).toContain('Not tracked')
    expect(html).toContain('In My Jobs')
  })

  it('keeps untracked postings out of the personal section', () => {
    mocks.useCompany.mockReturnValue({
      data: makeCompanyDetail({
        jobs: [
          { id: 2, jobTitle: 'Untracked role', interviewStage: null, isTracked: false, salaryMin: null, salaryMax: null, dateFound: '2026-08-02' },
        ],
        trackedJobCount: 0,
      }),
      isLoading: false,
    })

    const html = renderToStaticMarkup(<CompanyDetailPage />)
    const personalSection = html.slice(html.indexOf('My tracked jobs at this company'))

    expect(personalSection).toContain('You have not saved any of this company')
    expect(personalSection).not.toContain('Untracked role')
  })
})

describe('analytics dataset labeling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useAnalytics.mockReturnValue({ data: undefined, isLoading: false, isError: false })
    mocks.useTaxonomyAnalytics.mockReturnValue({ data: undefined, isLoading: false, isError: false })
  })

  it('declares every chart as global catalog supply and points personal KPIs elsewhere', () => {
    const html = renderToStaticMarkup(
      <AnalyticsClient initialState={{ category: 'skills', from: '', to: '', platform: '', clearance: '' }} />,
    )

    expect(html).toContain('Global catalog')
    expect(html).toContain('shared job catalog')
    expect(html).toContain('Dashboard')
    // Catalog analytics must never claim to summarize the reader's own applications.
    expect(html).not.toContain('across your job dataset')
    // One badge per chart card plus the page-level note.
    expect(html.split('Global catalog').length - 1).toBeGreaterThanOrEqual(6)
  })
})
