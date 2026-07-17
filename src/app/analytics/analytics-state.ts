import type { TaxonomyAnalyticsRow, TaxonomyCategory } from '@/lib/queries'
import { sourcePlatformValues } from '@/lib/source-platforms'

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

function validIsoDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return ''
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? value
    : ''
}

export function parseAnalyticsUrlState(params: SearchParams): AnalyticsUrlState {
  const category = first(params.category)
  const clearance = first(params.security_clearance)
  let from = validIsoDate(first(params.from))
  let to = validIsoDate(first(params.to))
  if (from && to && from > to) {
    from = ''
    to = ''
  }
  const platform = first(params.platform)
  return {
    category: TAXONOMY_CATEGORIES.some(option => option.value === category)
      ? category as TaxonomyCategory
      : 'skills',
    from,
    to,
    platform: sourcePlatformValues.some(value => value === platform) ? platform ?? '' : '',
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
  const escape = (value: string | number) => {
    const text = typeof value === 'string' && /^[=+\-@]/.test(value) ? `'${value}` : String(value)
    return `"${text.replaceAll('"', '""')}"`
  }
  return [
    [categoryLabel, 'Count', 'Percentage', 'Percentage denominator'],
    ...rows.map(row => [row.name, row.count, row.percentage, denominator]),
  ].map(row => row.map(escape).join(',')).join('\n')
}

export function taxonomyTooltipValue(
  value: unknown,
  percentage: unknown,
  categoryLabel: string,
): [string, string] {
  return [`${String(value)} jobs (${String(percentage)}%)`, categoryLabel]
}
