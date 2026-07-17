// @vitest-environment jsdom

import React, { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LookupItem } from '@/types/queries'

const mocks = vi.hoisted(() => ({
  useTagLookup: vi.fn(),
  useTagLookupByIds: vi.fn(),
  refetch: vi.fn(),
}))

vi.mock('@/lib/queries', () => ({
  useTagLookup: mocks.useTagLookup,
  useTagLookupByIds: mocks.useTagLookupByIds,
}))

import { TaxonomyFilters } from '@/components/jobs/TaxonomyFilters'

type Category = 'skills' | 'software' | 'certifications' | 'keywords'

const catalogs: Record<Category, LookupItem[]> = {
  skills: [{ id: 1, name: 'Shared' }, { id: 99, name: 'Zymurgy' }],
  software: [{ id: 2, name: 'Shared' }, { id: 20, name: 'Docker' }],
  certifications: [{ id: 30, name: 'CISSP' }],
  keywords: [{ id: 40, name: 'Remote' }],
}

function queryResult(overrides: Record<string, unknown> = {}) {
  return {
    data: [],
    isLoading: false,
    isError: false,
    refetch: mocks.refetch,
    ...overrides,
  }
}

function Harness({ initial = '' }: { initial?: string }) {
  const [params, setParams] = useState(() => new URLSearchParams(initial))
  return (
    <>
      <output data-testid="params">{params.toString()}</output>
      <TaxonomyFilters
        searchParams={params}
        onChange={(param, value) => setParams(current => {
          const next = new URLSearchParams(current)
          if (value) next.set(param, value)
          else next.delete(param)
          return next
        })}
        onClearAll={() => setParams(current => {
          const next = new URLSearchParams(current)
          for (const param of ['skill_ids', 'software_ids', 'certification_ids', 'keyword_ids']) {
            next.delete(param)
          }
          return next
        })}
      />
    </>
  )
}

describe('TaxonomyFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useTagLookup.mockImplementation((category: Category, search: string) => {
      const data = search === 'Zymurgy'
        ? catalogs.skills.filter(option => option.name === search)
        : catalogs[category].filter(option => option.id !== 99)
      return queryResult({ data })
    })
    mocks.useTagLookupByIds.mockImplementation((category: Category, ids: number[]) =>
      queryResult({ data: catalogs[category].filter(option => ids.includes(option.id)) }))
  })

  it('searches beyond the initial results and preserves the selected name after search is cleared', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    expect(screen.queryByText('Zymurgy')).not.toBeInTheDocument()
    const search = screen.getByRole('searchbox', { name: 'Search skills' })
    await user.type(search, 'Zymurgy')
    expect(mocks.useTagLookup).toHaveBeenCalledWith('skills', 'Zymurgy')
    expect(screen.getByText('Zymurgy')).toBeInTheDocument()

    await user.click(screen.getByText('Zymurgy'))
    expect(screen.getByRole('button', { name: 'Remove Skills filter Zymurgy' })).toBeInTheDocument()
    expect(screen.getByTestId('params')).toHaveTextContent('skill_ids=99')

    await user.clear(search)
    expect(screen.queryByText(/^Zymurgy$/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Skills filter Zymurgy' })).toHaveTextContent('Skills: Zymurgy')
  })

  it('resolves a URL-restored selection outside the initial result page', () => {
    render(<Harness initial="skill_ids=99" />)

    expect(mocks.useTagLookupByIds).toHaveBeenCalledWith('skills', [99])
    expect(screen.getByRole('button', { name: 'Remove Skills filter Zymurgy' })).toBeInTheDocument()
    expect(screen.getByLabelText('Skills filter, 1 selected')).toHaveTextContent('Skills (1)')
  })

  it('isolates same-name values by category, removes one chip, and clears all remaining filters', async () => {
    const user = userEvent.setup()
    render(<Harness initial="q=engineer&skill_ids=1&software_ids=2&certification_ids=30" />)

    const active = screen.getByLabelText('Active taxonomy filters')
    expect(within(active).getByRole('button', { name: 'Remove Skills filter Shared' })).toBeInTheDocument()
    expect(within(active).getByRole('button', { name: 'Remove Software filter Shared' })).toBeInTheDocument()

    await user.click(within(active).getByRole('button', { name: 'Remove Skills filter Shared' }))
    expect(screen.getByTestId('params')).not.toHaveTextContent('skill_ids')
    expect(screen.getByTestId('params')).toHaveTextContent('software_ids=2')

    await user.click(screen.getByRole('button', { name: 'Clear all 2 taxonomy filters' }))
    expect(screen.getByTestId('params')).toHaveTextContent('q=engineer')
    expect(screen.getByTestId('params')).not.toHaveTextContent('_ids')
    expect(screen.queryByLabelText('Active taxonomy filters')).not.toBeInTheDocument()
  })

  it('exposes loading, empty, error/retry, search, and selected-count states accessibly', async () => {
    mocks.useTagLookup.mockImplementation((category: Category, search: string) => {
      if (category === 'skills') return queryResult({ isLoading: true })
      if (category === 'software') return queryResult({ isError: true })
      if (category === 'certifications') return queryResult()
      return queryResult({ data: search ? [] : catalogs.keywords })
    })
    const user = userEvent.setup()
    render(<Harness initial="keyword_ids=40" />)

    expect(screen.getByText(/Loading skills/)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load software')
    await user.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Retry' }))
    expect(mocks.refetch).toHaveBeenCalledTimes(1)
    expect(screen.getByText('No certifications available.')).toBeInTheDocument()
    expect(screen.getByLabelText('Keywords filter, 1 selected')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search keywords' }), { target: { value: 'missing' } })
    expect(screen.getByText('No keywords match “missing”.')).toBeInTheDocument()
    expect(screen.getByLabelText('Job qualifications and keywords filters')).toBeInTheDocument()
  })
})
