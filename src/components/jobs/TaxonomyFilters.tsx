'use client'

import { useState } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { useTagLookup, type LookupItem } from '@/lib/queries'
import {
  jobsTaxonomyFilters,
  selectedTaxonomyIds,
  taxonomyValueName,
  toggleTaxonomyId,
  type TaxonomyFilterConfig,
} from '@/lib/jobs-taxonomy-filters'

type Props = {
  searchParams: URLSearchParams
  onChange: (param: string, value: string) => void
}

type FilterState = TaxonomyFilterConfig & {
  query: UseQueryResult<LookupItem[]>
  search: string
  setSearch: (value: string) => void
  selectedIds: number[]
}

function useSearchableTagLookup(category: TaxonomyFilterConfig['category']) {
  const [search, setSearch] = useState('')
  const query = useTagLookup(category, search)
  return { query, search, setSearch }
}

function TaxonomyFilterGroup({ filter, onChange }: {
  filter: FilterState
  onChange: Props['onChange']
}) {
  const { label, param, query, search, setSearch, selectedIds } = filter
  const options = query.data ?? []
  const searchId = `jobs-filter-${filter.category}-search`

  return (
    <details className="relative min-w-44 rounded-md border border-slate-200 bg-white">
      <summary
        className="cursor-pointer list-none px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
        aria-label={`${label} filter, ${selectedIds.length} selected`}
      >
        {label}{selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}
      </summary>
      <div className="absolute z-20 mt-1 max-h-80 w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-md border border-slate-200 bg-white p-3 shadow-lg sm:min-w-64">
        <p className="mb-2 text-xs font-medium text-slate-600">Select {label.toLowerCase()}</p>
        <label htmlFor={searchId} className="sr-only">Search {label.toLowerCase()}</label>
        <Input
          id={searchId}
          type="search"
          value={search}
          autoComplete="off"
          placeholder={`Search ${label.toLowerCase()}…`}
          aria-label={`Search ${label.toLowerCase()}`}
          className="mb-3"
          onChange={event => setSearch(event.target.value)}
        />
        {query.isLoading && <p role="status" className="text-xs text-slate-500">Loading {label.toLowerCase()}…</p>}
        {query.isError && (
          <div role="alert" className="space-y-2 text-xs text-red-700">
            <p>Could not load {label.toLowerCase()}.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => query.refetch()}>Retry</Button>
          </div>
        )}
        {!query.isLoading && !query.isError && options.length === 0 && (
          <p className="text-xs text-slate-500">
            {search.trim()
              ? `No ${label.toLowerCase()} match “${search.trim()}”.`
              : `No ${label.toLowerCase()} available.`}
          </p>
        )}
        <div className="space-y-2">
          {options.map(option => {
            const checked = selectedIds.includes(option.id)
            const inputId = `jobs-filter-${filter.category}-${option.id}`
            return (
              <label key={option.id} htmlFor={inputId} className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-sm">
                <Checkbox
                  id={inputId}
                  checked={checked}
                  onCheckedChange={value => onChange(
                    param,
                    toggleTaxonomyId(selectedIds, option.id, value === true),
                  )}
                />
                <span>{option.name}</span>
                {option.jobCount !== undefined && <span className="text-xs text-slate-500">({option.jobCount})</span>}
              </label>
            )
          })}
        </div>
      </div>
    </details>
  )
}

export function TaxonomyFilters({ searchParams, onChange }: Props) {
  const skills = useSearchableTagLookup('skills')
  const software = useSearchableTagLookup('software')
  const certifications = useSearchableTagLookup('certifications')
  const keywords = useSearchableTagLookup('keywords')
  const queries = { skills, software, certifications, keywords }

  const filters: FilterState[] = jobsTaxonomyFilters.map(filter => ({
    ...filter,
    ...queries[filter.category],
    selectedIds: selectedTaxonomyIds(searchParams, filter.param),
  }))

  const activeFilters = filters.flatMap(filter => filter.selectedIds.map(id => ({
    category: filter.category,
    categoryLabel: filter.label,
    id,
    name: taxonomyValueName(filter.query.data ?? [], id),
    param: filter.param,
    selectedIds: filter.selectedIds,
  })))

  return (
    <div className="w-full space-y-2" aria-label="Job qualifications and keywords filters">
      <div className="flex flex-wrap gap-2">
        {filters.map(filter => (
          <TaxonomyFilterGroup key={filter.category} filter={filter} onChange={onChange} />
        ))}
      </div>
      <p className="text-xs text-slate-600">
        Match any selected value within a category and every category that has a selection.
      </p>
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Active taxonomy filters">
          {activeFilters.map(filter => (
            <button
              type="button"
              key={`${filter.category}:${filter.id}`}
              className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-800 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
              aria-label={`Remove ${filter.categoryLabel} filter ${filter.name}`}
              onClick={() => onChange(
                filter.param,
                toggleTaxonomyId(filter.selectedIds, filter.id, false),
              )}
            >
              {filter.categoryLabel}: {filter.name} ×
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
