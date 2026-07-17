import { describe, expect, it } from 'vitest'
import {
  selectedTaxonomyIds,
  taxonomyJobsParams,
  taxonomyValueName,
  toggleTaxonomyId,
} from '@/lib/jobs-taxonomy-filters'

describe('jobs taxonomy filter state', () => {
  it('keeps four category-specific query parameters independent', () => {
    const params = new URLSearchParams({
      skill_ids: '1,2',
      software_ids: '3',
      certification_ids: '4',
      keyword_ids: '5,6',
    })

    expect(taxonomyJobsParams(params)).toEqual({
      skill_ids: '1,2',
      software_ids: '3',
      certification_ids: '4',
      keyword_ids: '5,6',
    })
    expect(selectedTaxonomyIds(params, 'software_ids')).toEqual([3])
  })

  it('does not leak same-name values between categories', () => {
    const skillOptions = [{ id: 7, name: 'Azure' }]
    const softwareOptions = [{ id: 42, name: 'Azure' }]

    expect(taxonomyValueName(skillOptions, 7)).toBe('Azure')
    expect(taxonomyValueName(softwareOptions, 42)).toBe('Azure')
    expect(toggleTaxonomyId([7], 42, true)).toBe('7,42')
    expect(toggleTaxonomyId([42], 7, false)).toBe('42')
  })

  it('deduplicates, sorts, and removes selected IDs', () => {
    expect(toggleTaxonomyId([9, 3, 9], 5, true)).toBe('3,5,9')
    expect(toggleTaxonomyId([9, 3], 9, false)).toBe('3')
  })

  it('forwards only canonical valid taxonomy IDs to the jobs API', () => {
    const overLimit = Array.from({ length: 101 }, (_, index) => index + 1).join(',')
    const params = new URLSearchParams()
    params.set('skill_ids', 'abc')
    params.set('software_ids', '3, 2,3')
    params.set('certification_ids', overLimit)
    params.append('keyword_ids', '8')
    params.append('keyword_ids', '7,8')

    expect(taxonomyJobsParams(params)).toEqual({
      skill_ids: undefined,
      software_ids: '3,2',
      certification_ids: undefined,
      keyword_ids: '8,7',
    })
  })
})
