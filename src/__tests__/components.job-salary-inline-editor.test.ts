import { describe, expect, it } from 'vitest'
import { validateSalaryForm } from '@/components/jobs/JobSalaryInlineEditor'

describe('validateSalaryForm', () => {
  it('accepts a valid annual salary range', () => {
    expect(validateSalaryForm({ type: 'annual', min: '80,000', max: '120000', currency: 'USD', text: '' })).toBe('')
  })

  it('rejects an inverted range', () => {
    expect(validateSalaryForm({ type: 'hourly', min: '80', max: '50', currency: 'USD', text: '' })).toBe('Min must be less than or equal to max.')
  })

  it('requires both ends of a structured range', () => {
    expect(validateSalaryForm({ type: 'annual', min: '80000', max: '', currency: 'USD', text: '' })).toBe('Min and max are both required.')
  })

  it('allows clearing the structured range', () => {
    expect(validateSalaryForm({ type: '', min: '', max: '', currency: 'USD', text: '' })).toBe('')
  })
})
