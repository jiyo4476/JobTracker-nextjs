import { describe, expect, it } from 'vitest'
import { formatSalary } from '@/lib/salary-format'

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

  it('recovers a misclassified hourly range from legacy salary text', () => {
    expect(formatSalary({
      salaryType: 'annual', salaryMin: 2347, salaryMax: 3450,
      hourlyRateMin: null, hourlyRateMax: null,
      salaryText: '$23.47 - $34.50',
    })).toBe('$23.47 - $34.50 per hour')
  })

  it('normalizes underscaled legacy annual ranges without exposing raw text', () => {
    expect(formatSalary({
      salaryType: 'annual', salaryMin: 6500, salaryMax: 7500,
      hourlyRateMin: null, hourlyRateMax: null,
      salaryText: 'Base pay range\n$65,000.00/yr - $75,000.00/yr',
    })).toBe('$65,000.00 - $75,000.00 per year')
    expect(formatSalary({
      salaryType: 'annual', salaryMin: 100, salaryMax: 120,
      hourlyRateMin: null, hourlyRateMax: null,
      salaryText: '$100k-$120k',
    })).toBe('$100,000.00 - $120,000.00 per year')
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
