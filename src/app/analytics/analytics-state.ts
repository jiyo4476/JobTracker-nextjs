import type { TaxonomyAnalyticsRow, TaxonomyCategory } from '@/lib/queries'

export const TAXONOMY_CATEGORIES = [
  { value: 'skills', label: 'Skills', singular: 'skill' },
  { value: 'software', label: 'Software', singular: 'software tool' },
  { value: 'certifications', label: 'Certifications', singular: 'certification' },
  { value: 'keywords', label: 'Keywords', singular: 'keyword' },
] as const satisfies readonly { value: TaxonomyCategory; label: string; singular: string }[]

export type AnalyticsUrlState = {
  category: TaxonomyCategory
  from: string
  to: string
  platform: string
  clearance: '' | 'true' | 'false'
}

type SearchParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export function parseAnalyticsUrlState(params: SearchParams): AnalyticsUrlState {
  const category = first(params.category)
  const clearance = first(params.security_clearance)
  return {
    category: TAXONOMY_CATEGORIES.some(option => option.value === category)
      ? category as TaxonomyCategory
      : 'skills',
    from: first(params.from) ?? '',
    to: first(params.to) ?? '',
    platform: first(params.platform) ?? '',
    clearance: clearance === 'true' || clearance === 'false' ? clearance : '',
  }
}

export function analyticsUrl(state: AnalyticsUrlState) {
  const params = new URLSearchParams({ category: state.category })
  if (state.from) params.set('from', state.from)
  if (state.to) params.set('to', state.to)
  if (state.platform) params.set('platform', state.platform)
  if (state.clearance) params.set('security_clearance', state.clearance)
  return `/analytics?${params.toString()}`
}

export function taxonomyCsv(categoryLabel: string, rows: TaxonomyAnalyticsRow[], denominator: string) {
  const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`
  return [
    [categoryLabel, 'Count', 'Percentage', 'Percentage denominator'],
    ...rows.map(row => [row.name, row.count, row.percentage, denominator]),
  ].map(row => row.map(escape).join(',')).join('\n')
}
