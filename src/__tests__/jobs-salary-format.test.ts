import { describe, expect, it } from 'vitest'
import { formatSalary } from '@/lib/salary-format'

describe('formatSalary', () => {
  it('formats an annual cents range with exactly two decimals', () => {
    expect(formatSalary({
      salaryType: 'annual', salaryMin: 8_000_000, salaryMax: 12_050_000,
      hourlyRateMin: null, hourlyRateMax: null,
    })).toBe('$80,000.00 - $120,500.00 per year')
  })

  it('formats an hourly dollar range with exactly two decimals', () => {
    expect(formatSalary({
      salaryType: 'hourly', salaryMin: null, salaryMax: null,
      hourlyRateMin: '45.5', hourlyRateMax: '62.25',
    })).toBe('$45.50 - $62.25 per hour')
  })

  it('does not show raw, single-sided, zero, or invalid salaries', () => {
    expect(formatSalary({
      salaryType: 'annual', salaryMin: 8_000_000, salaryMax: null,
      hourlyRateMin: null, hourlyRateMax: null,
    })).toBe('—')
    expect(formatSalary({
      salaryType: 'hourly', salaryMin: null, salaryMax: null,
      hourlyRateMin: '0', hourlyRateMax: 'not-a-number',
    })).toBe('—')
  })
})
