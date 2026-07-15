import { describe, expect, it } from 'vitest'
import { formatSalary } from '@/app/jobs/JobsClient'

describe('formatSalary', () => {
  it('shows an em dash when salary values are missing', () => {
    expect(formatSalary(null, null, null)).toBe('—')
  })

  it('shows an em dash when placeholder values would render as zero thousands', () => {
    expect(formatSalary(1, 1, null)).toBe('—')
    expect(formatSalary(80, 120, null)).toBe('—')
    expect(formatSalary(0, 0, null)).toBe('—')
  })

  it('uses the raw salary text when legacy numeric values are underscaled', () => {
    expect(formatSalary(10_500, 16_100, '$105,050 to $161,800')).toBe('$105,050 to $161,800')
  })

  it('formats valid annual-equivalent cents as a compact range', () => {
    expect(formatSalary(8_000_000, 12_000_000, '$80,000 to $120,000')).toBe('$80k–$120k')
  })
})
