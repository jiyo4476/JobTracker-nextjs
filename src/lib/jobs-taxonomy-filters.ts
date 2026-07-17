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
  const canonicalValue = (param: TaxonomyFilterParam) => {
    const parsed = parsePositiveIdFilter(searchParams, param)
    return parsed.success && parsed.ids.length > 0 ? parsed.ids.join(',') : undefined
  }

  return {
    skill_ids: canonicalValue(taxonomyFilterParams.skills),
    software_ids: canonicalValue(taxonomyFilterParams.software),
    certification_ids: canonicalValue(taxonomyFilterParams.certifications),
    keyword_ids: canonicalValue(taxonomyFilterParams.keywords),
  }
}

export function taxonomyValueName(options: readonly LookupItem[], id: number) {
  return options.find(option => option.id === id)?.name ?? `#${id}`
}
