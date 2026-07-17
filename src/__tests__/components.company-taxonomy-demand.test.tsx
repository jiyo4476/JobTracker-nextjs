// @vitest-environment happy-dom

import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CompanyTaxonomyDemand as Demand } from '@/types/queries'

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

import { CompanyTaxonomyDemand } from '@/components/companies/CompanyTaxonomyDemand'

const demand: Demand = {
  activeJobCount: 2,
  skills: [{ id: 1, name: 'TypeScript', jobCount: 2 }],
  software: [{ id: 2, name: 'Docker', jobCount: 1 }],
  certifications: [{ id: 3, name: 'CISSP', jobCount: 1 }],
  keywords: [{ id: 4, name: 'Remote', jobCount: 2 }],
  truncated: { skills: false, software: false, certifications: false, keywords: false },
}

describe('CompanyTaxonomyDemand', () => {
  it('keeps all four categories separate with accessible category-specific job links', () => {
    render(<CompanyTaxonomyDemand companyId={7} demand={demand} />)

    for (const heading of ['Skills', 'Software', 'Certifications', 'Keywords']) {
      expect(screen.getByRole('heading', { name: heading })).toBeTruthy()
    }
    expect(screen.getByText('Limited sample: based on 2 active jobs.')).toBeTruthy()

    const links = [
      ['Skills', 'TypeScript', '/jobs?company_id=7&skill_ids=1'],
      ['Software', 'Docker', '/jobs?company_id=7&software_ids=2'],
      ['Certifications', 'CISSP', '/jobs?company_id=7&certification_ids=3'],
      ['Keywords', 'Remote', '/jobs?company_id=7&keyword_ids=4'],
    ] as const
    for (const [group, value, href] of links) {
      const section = screen.getByRole('heading', { name: group }).closest('section') as HTMLElement
      const link = within(section).getByRole('link', { name: new RegExp(value) })
      expect(link.getAttribute('href')).toBe(href)
    }
  })

  it('describes empty active-job and untagged low-sample states without claiming a trend', () => {
    const view = render(<CompanyTaxonomyDemand companyId={7} demand={{
      activeJobCount: 0,
      skills: [],
      software: [],
      certifications: [],
      keywords: [],
      truncated: { skills: false, software: false, certifications: false, keywords: false },
    }} />)
    expect(screen.getByText('No active jobs are available to summarize.')).toBeTruthy()
    expect(screen.queryByText(/Based on/)).toBeNull()

    view.rerender(<CompanyTaxonomyDemand companyId={7} demand={{
      activeJobCount: 1,
      skills: [],
      software: [],
      certifications: [],
      keywords: [],
      truncated: { skills: false, software: false, certifications: false, keywords: false },
    }} />)
    expect(screen.getByText('Limited sample: based on 1 active job.')).toBeTruthy()
    expect(screen.getByText('No Skills, Software, Certifications, or Keywords are linked to these active jobs yet.')).toBeTruthy()
    expect(screen.getByText('No skills found.')).toBeTruthy()
  })

  it('announces when a category is limited to its most common values', () => {
    render(<CompanyTaxonomyDemand companyId={7} demand={{
      ...demand,
      truncated: { ...demand.truncated, skills: true },
    }} />)

    expect(screen.getByText('Showing the 10 most common skills.')).toBeTruthy()
    expect(screen.queryByText('Showing the 10 most common software.')).toBeNull()
  })
})
