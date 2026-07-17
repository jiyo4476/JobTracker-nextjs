import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CompanyDetail } from '@/types/queries'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  mutate: vi.fn(),
  useCompany: vi.fn(),
  usePatchCompany: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '7' }),
  useRouter: () => ({ push: mocks.push }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

vi.mock('@/lib/queries', () => ({
  useCompany: mocks.useCompany,
  usePatchCompany: mocks.usePatchCompany,
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

import CompanyEditPage, {
  buildCompanyPatch,
  companyEditSchema,
  companyToFormValues,
} from '@/app/companies/[id]/edit/page'

const company: CompanyDetail = {
  id: 7,
  name: 'Acme Corp',
  website: 'https://acme.example',
  industry: 'Software',
  hqLocation: 'Denver, CO',
  jobCount: 2,
  avgSalaryMax: null,
  sizeRange: '51-200',
  notes: 'Builds useful things.',
  glassdoorUrl: null,
  linkedinUrl: 'https://linkedin.com/company/acme',
  jobs: [],
  taxonomyDemand: {
    activeJobCount: 0,
    skills: [],
    software: [],
    certifications: [],
    keywords: [],
  },
}

describe('CompanyEditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useCompany.mockReturnValue({ data: company, isLoading: false, isError: false })
    mocks.usePatchCompany.mockReturnValue({ mutate: mocks.mutate, isPending: false })
  })

  it('renders every profile field from TanStack Query state and keeps Save disabled initially', () => {
    const html = renderToStaticMarkup(<CompanyEditPage />)

    expect(mocks.useCompany).toHaveBeenCalledWith(7)
    expect(html).toContain('Edit Company Profile')
    for (const field of ['Company Name', 'Website', 'Location', 'Industry', 'Company Size', 'Description', 'LinkedIn URL', 'Glassdoor URL']) {
      expect(html).toContain(field)
    }
    expect(html).toContain('0 / 5,000')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Save Changes<\/button>/)
  })

  it('maps company data into form values and sends snake_case nullable fields', () => {
    const values = companyToFormValues(company)

    expect(values.description).toBe('Builds useful things.')
    expect(values.size).toBe('51-200')
    expect(buildCompanyPatch({ ...values, website: '', size: '', linkedinUrl: '' })).toEqual({
      name: 'Acme Corp',
      website: null,
      hq_location: 'Denver, CO',
      industry: 'Software',
      size_range: null,
      notes: 'Builds useful things.',
      linkedin_url: null,
      glassdoor_url: null,
    })
  })

  it('validates website format and description length', () => {
    const values = companyToFormValues(company)

    expect(companyEditSchema.safeParse({ ...values, website: 'acme.example' }).success).toBe(false)
    expect(companyEditSchema.safeParse({ ...values, website: 'javascript:alert(1)' }).success).toBe(false)
    expect(companyEditSchema.safeParse({ ...values, description: 'x'.repeat(5001) }).success).toBe(false)
    expect(companyEditSchema.safeParse(values).success).toBe(true)
  })
})
