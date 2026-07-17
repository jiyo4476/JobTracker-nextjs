import { describe, expect, it } from 'vitest'
import { parsePositiveIdFilter } from '@/lib/taxonomy'

describe('parsePositiveIdFilter', () => {
  it('accepts comma-separated and repeated values with stable deduplication', () => {
    const params = new URLSearchParams('skill_ids=2,1&skill_ids=2')
    expect(parsePositiveIdFilter(params, 'skill_ids')).toEqual({
      success: true,
      ids: [2, 1],
    })
  })

  it.each(['', '0', '-1', '1.5', '1,', '9007199254740992'])(
    'rejects invalid ID input %j',
    (value) => {
      const params = new URLSearchParams()
      params.set('keyword_ids', value)
      expect(parsePositiveIdFilter(params, 'keyword_ids').success).toBe(false)
    },
  )

  it('rejects more than 100 distinct IDs', () => {
    const params = new URLSearchParams({
      software_ids: Array.from({ length: 101 }, (_, index) => String(index + 1)).join(','),
    })
    expect(parsePositiveIdFilter(params, 'software_ids')).toEqual({
      success: false,
      error: 'Invalid software_ids: at most 100 IDs are allowed',
    })
  })
})
