import { z } from 'zod'

export const taxonomyCategorySchema = z.enum([
  'skills',
  'software',
  'certifications',
  'keywords',
])

export type TaxonomyCategory = z.infer<typeof taxonomyCategorySchema>

export const taxonomyFilterParams = {
  skills: 'skill_ids',
  software: 'software_ids',
  certifications: 'certification_ids',
  keywords: 'keyword_ids',
} as const satisfies Record<TaxonomyCategory, string>

export type TaxonomyFilterParam = (typeof taxonomyFilterParams)[TaxonomyCategory]

export function parsePositiveIdFilter(
  searchParams: URLSearchParams,
  param: TaxonomyFilterParam,
): { success: true; ids: number[] } | { success: false; error: string } {
  const values = searchParams.getAll(param)
  if (values.length === 0) return { success: true, ids: [] }

  const tokens = values.flatMap(value => value.split(',')).map(value => value.trim())
  if (
    tokens.some(token => !/^\d+$/.test(token)) ||
    tokens.some(token => {
      const id = Number(token)
      return !Number.isSafeInteger(id) || id <= 0
    })
  ) {
    return {
      success: false,
      error: `Invalid ${param}: expected comma-separated positive integers`,
    }
  }

  const ids = [...new Set(tokens.map(Number))]
  if (ids.length > 100) {
    return { success: false, error: `Invalid ${param}: at most 100 IDs are allowed` }
  }

  return { success: true, ids }
}
