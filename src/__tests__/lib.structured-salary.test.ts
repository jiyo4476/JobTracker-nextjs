import { describe, it, expect } from 'vitest'
import { structuredSalaryFromText } from '@/lib/salary-format'

describe('structuredSalaryFromText', () => {
  it('parses an annual range into integer cents', () => {
    expect(structuredSalaryFromText('$80,000 - $120,000')).toEqual({
      salaryType: 'annual',
      salaryMin: 8_000_000,
      salaryMax: 12_000_000,
      hourlyRateMin: null,
      hourlyRateMax: null,
      annualEquivalentMin: 8_000_000,
      annualEquivalentMax: 12_000_000,
    })
  })

  it('parses a "k" annual range', () => {
    expect(structuredSalaryFromText('$80k – $120k')).toEqual({
      salaryType: 'annual',
      salaryMin: 8_000_000,
      salaryMax: 12_000_000,
      hourlyRateMin: null,
      hourlyRateMax: null,
      annualEquivalentMin: 8_000_000,
      annualEquivalentMax: 12_000_000,
    })
  })

  it('parses an hourly range into numeric strings + annual-equivalent cents', () => {
    // 45 × 2080 × 100 = 9_360_000 ; 60 × 2080 × 100 = 12_480_000
    expect(structuredSalaryFromText('$45 - $60 /hr')).toEqual({
      salaryType: 'hourly',
      salaryMin: null,
      salaryMax: null,
      hourlyRateMin: '45.00',
      hourlyRateMax: '60.00',
      annualEquivalentMin: 9_360_000,
      annualEquivalentMax: 12_480_000,
    })
  })

  it('returns null for unparseable text', () => {
    expect(structuredSalaryFromText('Competitive')).toBeNull()
    expect(structuredSalaryFromText('DOE')).toBeNull()
  })

  it('returns null when only a single amount is present (no range)', () => {
    expect(structuredSalaryFromText('$100,000')).toBeNull()
  })

  it('returns null for null/empty input', () => {
    expect(structuredSalaryFromText(null)).toBeNull()
    expect(structuredSalaryFromText('')).toBeNull()
  })
})
