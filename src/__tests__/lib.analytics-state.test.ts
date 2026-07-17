import { describe, expect, it } from 'vitest'
import { analyticsUrl, parseAnalyticsUrlState, taxonomyCsv, taxonomyTooltipValue } from '@/app/analytics/analytics-state'

describe('analytics taxonomy URL and export state', () => {
  it('restores valid category and global filters while rejecting invalid category state', () => {
    expect(parseAnalyticsUrlState({ category: 'certifications', from: '2026-01-01', platform: 'linkedin', security_clearance: 'false' })).toEqual({ category: 'certifications', from: '2026-01-01', to: '', platform: 'linkedin', clearance: 'false' })
    expect(parseAnalyticsUrlState({ category: 'combined', security_clearance: 'maybe' })).toMatchObject({ category: 'skills', clearance: '' })
  })

  it('rejects malformed, impossible, reversed, and unknown restored filters', () => {
    expect(parseAnalyticsUrlState({ from: 'not-a-date', to: '2026-02-30', platform: 'monster' })).toMatchObject({ from: '', to: '', platform: '' })
    expect(parseAnalyticsUrlState({ from: '2026-03-01', to: '2026-02-01', platform: 'indeed' })).toMatchObject({ from: '', to: '', platform: 'indeed' })
  })

  it('preserves global filters when category changes are serialized', () => {
    expect(analyticsUrl({ category: 'keywords', from: '2026-01-01', to: '2026-02-01', platform: 'indeed', clearance: 'true' })).toBe('/analytics?category=keywords&from=2026-01-01&to=2026-02-01&platform=indeed&security_clearance=true')
  })

  it('names the active category and denominator in exports', () => {
    const csv = taxonomyCsv('Certifications', [{ name: 'AWS "Pro"', count: 4, percentage: 40 }], 'certification assignments')
    expect(csv).toContain('"Certifications","Count","Percentage","Percentage denominator"')
    expect(csv).toContain('"AWS ""Pro""","4","40","certification assignments"')
  })

  it.each(['=cmd()', '+SUM(A1)', '-2+3', '@IMPORT'])('neutralizes formula-like CSV cells beginning with %s', (name) => {
    expect(taxonomyCsv('Keywords', [{ name, count: 1, percentage: 10 }], 'keyword assignments')).toContain(`"'${name}"`)
  })

  it('always includes taxonomy percentage context in the tooltip', () => {
    expect(taxonomyTooltipValue(4, 40, 'Certifications')).toEqual(['4 jobs (40%)', 'Certifications'])
  })
})
