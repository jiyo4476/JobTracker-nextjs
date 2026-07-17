// @vitest-environment happy-dom

import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserTaxonomyCategory, UserTaxonomyResponse } from '@/types/queries'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  patch: vi.fn(),
  remove: vi.fn(),
  refetch: vi.fn(),
  useUserTaxonomies: vi.fn(),
  useTagLookup: vi.fn(),
  useUserTaxonomyGap: vi.fn(),
}))

vi.mock('@/lib/queries', () => ({
  useUserTaxonomies: mocks.useUserTaxonomies,
  useTagLookup: mocks.useTagLookup,
  useUserTaxonomyGap: mocks.useUserTaxonomyGap,
  useCreateUserTaxonomy: () => ({ mutate: mocks.create, isPending: false, isError: false }),
  usePatchUserTaxonomy: () => ({ mutate: mocks.patch, isPending: false, isError: false }),
  useDeleteUserTaxonomy: () => ({ mutate: mocks.remove, isPending: false, isError: false }),
}))

import {
  TaxonomyProfileAndGapSettings,
  TaxonomyProfileSettings,
} from '@/app/settings/TaxonomyProfileSettings'

const profiles: Record<UserTaxonomyCategory, UserTaxonomyResponse> = {
  skills: {
    category: 'skills',
    items: [{ taxonomyId: 1, name: 'Python', hasSkill: true }],
  },
  software: {
    category: 'software',
    items: [{ taxonomyId: 2, name: 'Docker', familiarity: 'proficient' }],
  },
  certifications: {
    category: 'certifications',
    items: [{
      taxonomyId: 3,
      name: 'CISSP',
      issuer: 'ISC2',
      earnedDate: '2025-01-01',
      expiresAt: null,
      credentialUrl: 'https://example.com/cissp',
    }],
  },
  keywords: {
    category: 'keywords',
    items: [{ taxonomyId: 4, name: 'Remote', preference: 'interest' }],
  },
}

function queryResult(data: UserTaxonomyResponse, overrides: Record<string, unknown> = {}) {
  return {
    data,
    isLoading: false,
    isError: false,
    refetch: mocks.refetch,
    ...overrides,
  }
}

describe('TaxonomyProfileSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useUserTaxonomies.mockImplementation((category: UserTaxonomyCategory) =>
      queryResult(profiles[category]))
    mocks.useTagLookup.mockImplementation((category: UserTaxonomyCategory, search: string) => ({
      data: search.toLowerCase() === 'typescript' && category === 'skills'
        ? [{ id: 10, name: 'TypeScript' }]
        : [],
      isError: false,
    }))
    mocks.useUserTaxonomyGap.mockImplementation((category: UserTaxonomyCategory) => ({
      data: {
        category,
        counts: { profile: 1, demanded: 3, matched: 1, excluded: 0, gaps: 2 },
        items: [{ taxonomyId: 90, name: `${category} gap`, jobCount: 3, profileStatus: null, matchState: 'gap' }],
        page: 1,
        totalPages: 1,
      },
      isLoading: false,
      isError: false,
      refetch: mocks.refetch,
    }))
    mocks.create.mockImplementation((_variables, options) => options?.onSuccess?.())
    mocks.patch.mockImplementation((_variables, options) => options?.onSuccess?.())
  })

  it('renders populated profile sections with category-specific meaning', () => {
    render(<TaxonomyProfileSettings />)

    for (const heading of ['My Skills', 'Software Experience', 'Certifications Held', 'Keyword Preferences']) {
      expect(screen.getByRole('heading', { name: heading })).toBeTruthy()
    }
    expect(screen.getAllByText('Python').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Docker').length).toBeGreaterThan(0)
    expect(screen.getAllByText('CISSP').length).toBeGreaterThan(0)
    expect(screen.getByText('ISC2 · Earned 2025-01-01')).toBeTruthy()
    expect(screen.getAllByText('Remote').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Interested in').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Edit Docker' })).toBeTruthy()
    expect(screen.getByText('proficient')).toBeTruthy()
  })

  it('adds an existing catalog skill by ID and blocks a same-category duplicate', async () => {
    const user = userEvent.setup()
    render(<TaxonomyProfileSettings />)

    const skillInput = screen.getByRole('combobox', { name: 'Add skill' })
    await user.type(skillInput, 'TypeScript')
    await user.click(screen.getByRole('button', { name: 'Add skill' }))
    expect(mocks.create).toHaveBeenCalledWith(
      { category: 'skills', body: { taxonomy_id: 10, has_skill: true } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )

    await user.clear(skillInput)
    await user.type(skillInput, 'PYTHON')
    expect(screen.getByText('PYTHON is already in this section.')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Add skill' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('creates category-specific certification and keyword metadata', async () => {
    const user = userEvent.setup()
    render(<TaxonomyProfileSettings />)

    const softwareSection = screen.getByRole('region', { name: 'Software Experience' })
    await user.type(within(softwareSection).getByRole('combobox', { name: 'Add software' }), 'Kubernetes')
    await user.selectOptions(within(softwareSection).getByLabelText('Familiarity'), 'familiar')
    await user.click(within(softwareSection).getByRole('button', { name: 'Add software' }))
    expect(mocks.create).toHaveBeenCalledWith(
      { category: 'software', body: { name: 'Kubernetes', familiarity: 'familiar' } },
      expect.any(Object),
    )

    await user.type(screen.getByRole('combobox', { name: 'Add certification' }), 'Security+')
    await user.type(screen.getByRole('textbox', { name: 'Issuer' }), 'CompTIA')
    await user.type(screen.getByLabelText('Earned date'), '2026-02-03')
    await user.click(screen.getByRole('button', { name: 'Add certification' }))
    expect(mocks.create).toHaveBeenCalledWith(
      {
        category: 'certifications',
        body: expect.objectContaining({ name: 'Security+', issuer: 'CompTIA', earned_date: '2026-02-03' }),
      },
      expect.any(Object),
    )

    await user.type(screen.getByRole('combobox', { name: 'Add keyword' }), 'On-site only')
    await user.selectOptions(screen.getByLabelText('Preference'), 'exclusion')
    await user.click(screen.getByRole('button', { name: 'Add keyword' }))
    expect(mocks.create).toHaveBeenCalledWith(
      { category: 'keywords', body: { name: 'On-site only', preference: 'exclusion' } },
      expect.any(Object),
    )
  })

  it('edits metadata, removes by category and taxonomy ID, and supports cancel', async () => {
    const user = userEvent.setup()
    render(<TaxonomyProfileSettings />)

    await user.click(screen.getByRole('button', { name: 'Edit Remote' }))
    const keywordItem = screen.getByText('Edit Remote').closest('form') as HTMLFormElement
    await user.selectOptions(within(keywordItem).getByLabelText('Preference'), 'exclusion')
    await user.click(within(keywordItem).getByRole('button', { name: 'Save' }))
    expect(mocks.patch).toHaveBeenCalledWith(
      { category: 'keywords', taxonomyId: 4, body: { preference: 'exclusion' } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )

    await user.click(screen.getByRole('button', { name: 'Edit CISSP' }))
    expect(screen.getByText('Edit CISSP')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('Edit CISSP')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Remove Docker' }))
    expect(mocks.remove).toHaveBeenCalledWith({ category: 'software', taxonomyId: 2 })
  })

  it('starts a new edit from refetched metadata instead of a stale closed draft', async () => {
    let keywordPreference: 'interest' | 'exclusion' = 'interest'
    mocks.useUserTaxonomies.mockImplementation((category: UserTaxonomyCategory) =>
      queryResult(category === 'keywords'
        ? { category: 'keywords', items: [{ taxonomyId: 4, name: 'Remote', preference: keywordPreference }] }
        : profiles[category]))
    const user = userEvent.setup()
    const view = render(<TaxonomyProfileSettings />)

    keywordPreference = 'exclusion'
    view.rerender(<TaxonomyProfileSettings />)
    await user.click(screen.getByRole('button', { name: 'Edit Remote' }))

    const editForm = screen.getByText('Edit Remote').closest('form') as HTMLFormElement
    expect((within(editForm).getByLabelText('Preference') as HTMLSelectElement).value).toBe('exclusion')
  })

  it('exposes independent loading, error/retry, empty, and partial states', async () => {
    mocks.useUserTaxonomies.mockImplementation((category: UserTaxonomyCategory) => {
      if (category === 'skills') return queryResult(profiles.skills, { isLoading: true })
      if (category === 'software') return queryResult(profiles.software, { isError: true })
      return queryResult({ ...profiles[category], items: [] } as UserTaxonomyResponse)
    })
    const user = userEvent.setup()
    render(<TaxonomyProfileSettings />)

    expect(screen.getByRole('status').textContent).toContain('Loading my skills')
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('Could not load software experience')
    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(mocks.refetch).toHaveBeenCalledTimes(1)
    expect(screen.getByText('No certifications added yet.')).toBeTruthy()
    expect(screen.getByText('No keyword preferences added yet.')).toBeTruthy()
  })

  it('switches category-scoped gap counts and recommendations with keyboard controls', async () => {
    const user = userEvent.setup()
    render(<TaxonomyProfileAndGapSettings />)

    expect(screen.getByRole('tabpanel').textContent).toContain('skills gap')
    expect(screen.getByLabelText('My Skills recommendations').textContent).toContain('skills gap')
    expect(screen.getByText('+1 more recommendations not shown')).toBeTruthy()
    screen.getByRole('tab', { name: 'My Skills' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Software Experience' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tabpanel').textContent).toContain('software gap')
    expect(mocks.useUserTaxonomyGap).toHaveBeenLastCalledWith('software')
  })

  it('renders gap loading, failure/retry, excluded-keyword, and no-demand states', async () => {
    mocks.useUserTaxonomyGap.mockImplementation((category: UserTaxonomyCategory) => {
      if (category === 'skills') return {
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: mocks.refetch,
      }
      if (category === 'software') return {
        data: undefined,
        isLoading: false,
        isError: true,
        refetch: mocks.refetch,
      }
      return {
        data: {
          category,
          counts: {
            profile: 1,
            demanded: category === 'keywords' ? 1 : 0,
            matched: 0,
            excluded: category === 'keywords' ? 1 : 0,
            gaps: 0,
          },
          items: [],
          page: 1,
          totalPages: 0,
        },
        isLoading: false,
        isError: false,
        refetch: mocks.refetch,
      }
    })
    const user = userEvent.setup()
    render(<TaxonomyProfileAndGapSettings />)

    expect(screen.getAllByRole('status').some(node => node.textContent?.includes('Loading my skills gaps'))).toBe(true)
    await user.click(screen.getByRole('tab', { name: 'Software Experience' }))
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('Could not load software experience gap analysis')
    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(mocks.refetch).toHaveBeenCalled()

    await user.click(screen.getByRole('tab', { name: 'Certifications Held' }))
    expect(screen.getByText('No certifications held demand appears in active saved jobs yet.')).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: 'Keyword Preferences' }))
    expect(screen.getByText('1 demanded keyword exclusions are respected.')).toBeTruthy()
    expect(screen.getByText(/No keyword preferences gaps found/)).toBeTruthy()
  })
})
