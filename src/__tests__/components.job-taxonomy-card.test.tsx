// @vitest-environment happy-dom

import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JobDetail, LookupItem } from '@/types/queries'

type Category = 'skills' | 'software' | 'certifications' | 'keywords'

const mocks = vi.hoisted(() => ({
  useTagLookup: vi.fn(),
  usePatchJobTags: vi.fn(),
  mutate: vi.fn(),
  refetch: vi.fn(),
}))

vi.mock('@/lib/queries', () => ({
  useTagLookup: mocks.useTagLookup,
  usePatchJobTags: mocks.usePatchJobTags,
}))

import { JobTaxonomyCard } from '@/components/jobs/JobTaxonomyCard'

const catalogs: Record<Category, LookupItem[]> = {
  skills: [{ id: 11, name: 'Shared' }, { id: 12, name: 'TypeScript' }],
  software: [{ id: 21, name: 'Shared' }, { id: 22, name: 'Docker' }],
  certifications: [{ id: 31, name: 'CISSP' }],
  keywords: [{ id: 41, name: 'Remote' }],
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

function makeJob(overrides: Partial<JobDetail> = {}): JobDetail {
  return {
    id: 7,
    jobTitle: 'Platform Engineer',
    skills: [{ id: 1, name: 'Python' }],
    software: [{ id: 2, name: 'Docker' }],
    certifications: [{ id: 3, name: 'CISSP' }],
    keywords: [{ id: 4, name: 'Remote' }],
    contacts: [],
    ...overrides,
  } as JobDetail
}

function responseFromBody(body: Record<Category, string[]>) {
  return {
    skills: body.skills.map((name, index) => ({ id: 100 + index, name })),
    software: body.software.map((name, index) => ({ id: 200 + index, name })),
    certifications: body.certifications.map((name, index) => ({ id: 300 + index, name })),
    keywords: body.keywords.map((name, index) => ({ id: 400 + index, name })),
    counts: {
      skills: body.skills.length,
      software: body.software.length,
      certifications: body.certifications.length,
      keywords: body.keywords.length,
    },
  }
}

describe('JobTaxonomyCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useTagLookup.mockImplementation((category: Category, query: string) => queryResult({
      data: query.trim()
        ? catalogs[category].filter(item => item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
        : catalogs[category],
    }))
    mocks.mutate.mockImplementation((variables, options) => options?.onSuccess(responseFromBody(variables.body)))
    mocks.usePatchJobTags.mockReturnValue({
      mutate: mocks.mutate,
      isPending: false,
      isError: false,
      error: null,
    })
  })

  it('shows all four read-only groups in the product order with category-specific empty states', () => {
    render(<JobTaxonomyCard jobId="7" job={makeJob({ software: [], keywords: [] })} />)

    const groups = screen.getByTestId('taxonomy-groups')
    const text = groups.textContent ?? ''
    expect(text.indexOf('Skills')).toBeLessThan(text.indexOf('Software'))
    expect(text.indexOf('Software')).toBeLessThan(text.indexOf('Certifications'))
    expect(text.indexOf('Certifications')).toBeLessThan(text.indexOf('Keywords'))
    expect(within(groups).getByText('No software selected.')).toBeTruthy()
    expect(within(groups).getByText('No keywords selected.')).toBeTruthy()
    expect(screen.getByText(/stay in separate categories/)).toBeTruthy()
    expect(groups.className).toContain('grid-cols-1')
    expect(groups.className).toContain('md:grid-cols-2')
  })

  it('keeps same-name values category-owned and sends all four matching API arrays when clearing and adding', async () => {
    const user = userEvent.setup()
    render(
      <JobTaxonomyCard
        jobId="7"
        job={makeJob({
          skills: [{ id: 11, name: 'Shared' }],
          software: [{ id: 21, name: 'Shared' }],
        })}
        mode="form"
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Remove Shared from Skills' }))
    expect(screen.getByText('No skills selected.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove Shared from Software' })).toBeTruthy()

    const keywordInput = screen.getByRole('combobox', { name: 'Search or add keywords' })
    await user.clear(keywordInput)
    await user.type(keywordInput, 'Cleared{enter}')
    await user.click(screen.getByRole('button', { name: 'Remove CISSP from Certifications' }))
    await user.click(screen.getByRole('button', { name: 'Save categories' }))

    expect(mocks.mutate).toHaveBeenCalledWith(
      {
        id: '7',
        body: {
          skills: [],
          software: ['Shared'],
          certifications: [],
          keywords: ['Cleared', 'Remote'],
        },
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  it('prevents case-insensitive duplicates and isolates Cancel and Reset behavior to the taxonomy card', async () => {
    const user = userEvent.setup()
    const onDirtyChange = vi.fn()
    const { rerender } = render(<JobTaxonomyCard jobId="7" job={makeJob()} onDirtyChange={onDirtyChange} />)

    await user.click(screen.getByRole('button', { name: 'Edit categories' }))
    const softwareInput = screen.getByRole('combobox', { name: 'Search or add software' })
    await user.type(softwareInput, 'docker{enter}')
    expect(screen.getAllByRole('button', { name: 'Remove Docker from Software' })).toHaveLength(1)
    expect((screen.getByRole('button', { name: 'Save categories' }) as HTMLButtonElement).disabled).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Remove Python from Skills' }))
    expect((screen.getByRole('button', { name: 'Save categories' }) as HTMLButtonElement).disabled).toBe(false)

    rerender(<JobTaxonomyCard jobId="7" job={makeJob({ skills: [{ id: 9, name: 'Go' }] })} onDirtyChange={onDirtyChange} />)
    expect(screen.queryByText('Go')).toBeNull()
    expect(screen.getByText('No skills selected.')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Go')).toBeTruthy()
    expect(screen.queryByText('Python')).toBeNull()
    expect(mocks.mutate).not.toHaveBeenCalled()
    expect(onDirtyChange).toHaveBeenCalledWith(true)
  })

  it('surfaces category lookup loading, empty, and retryable error states accessibly', async () => {
    mocks.useTagLookup.mockImplementation((category: Category) => {
      if (category === 'skills') return queryResult({ isLoading: true })
      if (category === 'software') return queryResult({ isError: true })
      return queryResult()
    })
    const user = userEvent.setup()
    render(<JobTaxonomyCard jobId="7" job={makeJob()} mode="form" />)

    await user.type(screen.getByRole('combobox', { name: 'Search or add skills' }), 'new')
    expect(screen.getByText('Loading skills…')).toBeTruthy()

    await user.type(screen.getByRole('combobox', { name: 'Search or add software' }), 'new')
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('Could not load software')
    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(mocks.refetch).toHaveBeenCalledTimes(1)

    await user.type(screen.getByRole('combobox', { name: 'Search or add certifications' }), 'new')
    expect(screen.getByText('No matching certifications.')).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Create certification “new”' })).toBeTruthy()
  })

  it('shows save errors in the card without moving or clearing category values', () => {
    mocks.usePatchJobTags.mockReturnValue({
      mutate: mocks.mutate,
      isPending: false,
      isError: true,
      error: new Error('API error 500: /jobs/7/tags'),
    })
    render(<JobTaxonomyCard jobId="7" job={makeJob()} mode="form" />)

    expect(screen.getByRole('alert').textContent).toContain('API error 500')
    expect(screen.getByRole('button', { name: 'Remove Python from Skills' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove Docker from Software' })).toBeTruthy()
  })
})
