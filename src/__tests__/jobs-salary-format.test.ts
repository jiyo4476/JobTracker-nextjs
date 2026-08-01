import { describe, expect, it } from 'vitest'
import { formatSalary, formatSalaryShort, formatSalaryRangeShort } from '@/lib/salary-format'

describe('formatSalary', () => {
  it('formats an annual cents range with exactly two decimals', () => {
    expect(formatSalary({
      salaryType: 'annual', salaryMin: 8_000_000, salaryMax: 12_050_000,
      hourlyRateMin: null, hourlyRateMax: null,
      salaryText: null,
    })).toBe('$80,000.00 - $120,500.00 per year')
  })

  it('formats an hourly dollar range with exactly two decimals', () => {
    expect(formatSalary({
      salaryType: 'hourly', salaryMin: null, salaryMax: null,
      hourlyRateMin: '45.5', hourlyRateMax: '62.25',
      salaryText: null,
    })).toBe('$45.50 - $62.25 per hour')
  })

  it('prefers structured cents over a conflicting free-text range', () => {
    // TECHDEBT-009: structured columns are authoritative; a stale/garbled
    // salary_text must not override validated data.
    expect(formatSalary({
      salaryType: 'annual', salaryMin: 8_000_000, salaryMax: 12_050_000,
      hourlyRateMin: null, hourlyRateMax: null,
      salaryText: '$1.00 - $2.00 per hour',
    })).toBe('$80,000.00 - $120,500.00 per year')
    expect(formatSalary({
      salaryType: 'hourly', salaryMin: null, salaryMax: null,
      hourlyRateMin: '45.5', hourlyRateMax: '62.25',
      salaryText: 'Base pay range\n$95,000.00/yr - $130,000.00/yr',
    })).toBe('$45.50 - $62.25 per hour')
  })

  it('falls back to salary_text only when structured values are absent', () => {
    expect(formatSalary({
      salaryType: 'annual', salaryMin: null, salaryMax: null,
      hourlyRateMin: null, hourlyRateMax: null,
      salaryText: 'Base pay range\n$65,000.00/yr - $75,000.00/yr',
    })).toBe('$65,000.00 - $75,000.00 per year')
    expect(formatSalary({
      salaryType: 'hourly', salaryMin: null, salaryMax: null,
      hourlyRateMin: null, hourlyRateMax: null,
      salaryText: '$23.47 - $34.50',
    })).toBe('$23.47 - $34.50 per hour')
  })

  it('does not show raw, single-sided, zero, or invalid salaries', () => {
    expect(formatSalary({
      salaryType: 'annual', salaryMin: 8_000_000, salaryMax: null,
      hourlyRateMin: null, hourlyRateMax: null,
      salaryText: '$80,000 per year',
    })).toBe('—')
    expect(formatSalary({
      salaryType: 'hourly', salaryMin: null, salaryMax: null,
      hourlyRateMin: '0', hourlyRateMax: 'not-a-number',
      salaryText: 'Competitive compensation',
    })).toBe('—')
  })
})

describe('formatSalaryShort', () => {
  it('rounds annual cents to the nearest thousand dollars', () => {
    expect(formatSalaryShort(15_000_000)).toBe('$150k')
    expect(formatSalaryShort(12_345_600)).toBe('$123k')
  })

  it('returns the placeholder for null, zero, or negative input', () => {
    expect(formatSalaryShort(null)).toBe('—')
    expect(formatSalaryShort(undefined)).toBe('—')
    expect(formatSalaryShort(0)).toBe('—')
    expect(formatSalaryShort(-100)).toBe('—')
  })
})

describe('formatSalaryRangeShort', () => {
  it('formats a two-sided range with an en dash', () => {
    expect(formatSalaryRangeShort(12_000_000, 15_000_000)).toBe('$120k – $150k')
  })

  it('falls back to the single present bound', () => {
    expect(formatSalaryRangeShort(null, 15_000_000)).toBe('$150k')
    expect(formatSalaryRangeShort(12_000_000, null)).toBe('$120k')
  })

  it('returns the placeholder when neither bound is set', () => {
    expect(formatSalaryRangeShort(null, null)).toBe('—')
  })
})
