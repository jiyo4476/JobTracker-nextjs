import type { LookupItem, JobsParams } from '@/types/queries'
import type { TaxonomyCategory, TaxonomyFilterParam } from '@/lib/taxonomy'
import { parsePositiveIdFilter, taxonomyFilterParams } from '@/lib/taxonomy'

export type TaxonomyFilterConfig = {
  category: TaxonomyCategory
  label: string
  param: TaxonomyFilterParam
}

export const jobsTaxonomyFilters: readonly TaxonomyFilterConfig[] = [
  { category: 'skills', label: 'Skills', param: taxonomyFilterParams.skills },
  { category: 'software', label: 'Software', param: taxonomyFilterParams.software },
  { category: 'certifications', label: 'Certifications', param: taxonomyFilterParams.certifications },
  { category: 'keywords', label: 'Keywords', param: taxonomyFilterParams.keywords },
]

export function selectedTaxonomyIds(searchParams: URLSearchParams, param: TaxonomyFilterParam) {
  const parsed = parsePositiveIdFilter(searchParams, param)
  return parsed.success ? parsed.ids : []
}

export function toggleTaxonomyId(
  selectedIds: readonly number[],
  id: number,
  checked: boolean,
) {
  const next = new Set(selectedIds)
  if (checked) next.add(id)
  else next.delete(id)
  return [...next].sort((a, b) => a - b).join(',')
}

export function taxonomyJobsParams(searchParams: URLSearchParams): Pick<
  JobsParams,
  'skill_ids' | 'software_ids' | 'certification_ids' | 'keyword_ids'
> {
  return {
    skill_ids: searchParams.get(taxonomyFilterParams.skills) || undefined,
    software_ids: searchParams.get(taxonomyFilterParams.software) || undefined,
    certification_ids: searchParams.get(taxonomyFilterParams.certifications) || undefined,
    keyword_ids: searchParams.get(taxonomyFilterParams.keywords) || undefined,
  }
}

export function taxonomyValueName(options: readonly LookupItem[], id: number) {
  return options.find(option => option.id === id)?.name ?? `#${id}`
}
