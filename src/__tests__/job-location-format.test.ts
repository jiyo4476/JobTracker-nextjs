import { describe, expect, it } from 'vitest'
import { formatJobLocation } from '@/lib/job-location-format'

describe('formatJobLocation', () => {
  it('keeps only city, state, and ZIP', () => {
    expect(formatJobLocation('US-CO-Denver, Denver, CO 80202, United States', false))
      .toBe('Denver, CO 80202')
  })

  it('appends normalized remote or hybrid mode', () => {
    expect(formatJobLocation('Denver, CO 80202 - Remote', true))
      .toBe('Denver, CO 80202 (Remote)')
    expect(formatJobLocation('Boulder, CO (hybrid, three days onsite)', false))
      .toBe('Boulder, CO (Hybrid)')
  })

  it('shows a work mode alone and hides unsupported location text', () => {
    expect(formatJobLocation('Remote - United States', true)).toBe('Remote')
    expect(formatJobLocation('Denver Metropolitan Area', false)).toBe('—')
  })
})
