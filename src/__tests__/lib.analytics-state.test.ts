import { describe, expect, it } from 'vitest'
import { analyticsUrl, parseAnalyticsUrlState, taxonomyCsv } from '@/app/analytics/analytics-state'

describe('analytics taxonomy URL and export state', () => {
  it('restores valid category and global filters while rejecting invalid category state', () => {
    expect(parseAnalyticsUrlState({ category: 'certifications', from: '2026-01-01', platform: 'linkedin', security_clearance: 'false' })).toEqual({ category: 'certifications', from: '2026-01-01', to: '', platform: 'linkedin', clearance: 'false' })
    expect(parseAnalyticsUrlState({ category: 'combined', security_clearance: 'maybe' })).toMatchObject({ category: 'skills', clearance: '' })
  })

  it('preserves global filters when category changes are serialized', () => {
    expect(analyticsUrl({ category: 'keywords', from: '2026-01-01', to: '2026-02-01', platform: 'indeed', clearance: 'true' })).toBe('/analytics?category=keywords&from=2026-01-01&to=2026-02-01&platform=indeed&security_clearance=true')
  })

  it('names the active category and denominator in exports', () => {
    const csv = taxonomyCsv('Certifications', [{ name: 'AWS "Pro"', count: 4, percentage: 40 }], 'certification assignments')
    expect(csv).toContain('"Certifications","Count","Percentage","Percentage denominator"')
    expect(csv).toContain('"AWS ""Pro""","4","40","certification assignments"')
  })
})
