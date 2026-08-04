import { describe, expect, it } from 'vitest'
import {
  applyJobStateAction,
  itemBelongsToScope,
  optimisticJobsUpdate,
  removalConfirmationText,
} from '@/lib/job-state'
import type { JobListItem, JobsResponse } from '@/types/queries'

function makeItem(overrides: Partial<JobListItem> = {}): JobListItem {
  return {
    id: 1,
    jobTitle: 'Engineer',
    jobLink: null,
    jobLocation: null,
    isRemote: null,
    sourcePlatform: null,
    jobType: null,
    experienceLevel: null,
    salaryMin: null,
    salaryMax: null,
    salaryType: null,
    hourlyRateMin: null,
    hourlyRateMax: null,
    annualEquivalentMin: null,
    annualEquivalentMax: null,
    salaryText: null,
    datePosted: null,
    dateFound: '2026-08-01',
    isActive: true,
    securityClearanceReq: null,
    companyId: null,
    companyName: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    isTracked: false,
    isHidden: false,
    hasApplied: null,
    dateApplied: null,
    heardBack: null,
    interviewStage: null,
    priority: null,
    ...overrides,
  }
}

function makeResponse(jobs: JobListItem[], scope: JobsResponse['scope']): JobsResponse {
  return { jobs, scope, total: jobs.length, page: 1, totalPages: 1 }
}

describe('applyJobStateAction', () => {
  it('save marks tracked and not hidden', () => {
    expect(applyJobStateAction(makeItem(), 'save')).toMatchObject({ isTracked: true, isHidden: false })
  })
  it('hide marks tracked and hidden', () => {
    expect(applyJobStateAction(makeItem({ isTracked: true }), 'hide')).toMatchObject({ isTracked: true, isHidden: true })
  })
  it('unhide marks tracked and not hidden', () => {
    expect(applyJobStateAction(makeItem({ isTracked: true, isHidden: true }), 'unhide')).toMatchObject({ isTracked: true, isHidden: false })
  })
  it('remove clears the whole personal overlay', () => {
    const removed = applyJobStateAction(
      makeItem({ isTracked: true, interviewStage: 'applied', priority: 4, hasApplied: true }),
      'remove',
    )
    expect(removed).toMatchObject({
      isTracked: false, isHidden: false, interviewStage: null, priority: null, hasApplied: null,
    })
  })
})

describe('itemBelongsToScope', () => {
  it('catalog keeps every row', () => {
    expect(itemBelongsToScope(makeItem(), 'catalog')).toBe(true)
    expect(itemBelongsToScope(makeItem({ isTracked: true, isHidden: true }), 'catalog')).toBe(true)
  })
  it('tracked keeps only tracked, non-hidden rows', () => {
    expect(itemBelongsToScope(makeItem({ isTracked: true }), 'tracked')).toBe(true)
    expect(itemBelongsToScope(makeItem({ isTracked: true, isHidden: true }), 'tracked')).toBe(false)
    expect(itemBelongsToScope(makeItem(), 'tracked')).toBe(false)
  })
  it('hidden keeps only tracked, hidden rows', () => {
    expect(itemBelongsToScope(makeItem({ isTracked: true, isHidden: true }), 'hidden')).toBe(true)
    expect(itemBelongsToScope(makeItem({ isTracked: true }), 'hidden')).toBe(false)
  })
})

describe('optimisticJobsUpdate', () => {
  it('drops a hidden row from the tracked view and decrements total', () => {
    const resp = makeResponse([makeItem({ id: 1, isTracked: true }), makeItem({ id: 2, isTracked: true })], 'tracked')
    const next = optimisticJobsUpdate(resp, 1, 'hide')
    expect(next.jobs.map(j => j.id)).toEqual([2])
    expect(next.total).toBe(1)
  })
  it('drops a removed row from the tracked view', () => {
    const resp = makeResponse([makeItem({ id: 1, isTracked: true })], 'tracked')
    expect(optimisticJobsUpdate(resp, 1, 'remove').jobs).toHaveLength(0)
  })
  it('keeps a saved row visible in the catalog view but flips its flag', () => {
    const resp = makeResponse([makeItem({ id: 1 })], 'catalog')
    const next = optimisticJobsUpdate(resp, 1, 'save')
    expect(next.jobs).toHaveLength(1)
    expect(next.jobs[0].isTracked).toBe(true)
    expect(next.total).toBe(1)
  })
  it('drops an unhidden row from the hidden view', () => {
    const resp = makeResponse([makeItem({ id: 1, isTracked: true, isHidden: true })], 'hidden')
    expect(optimisticJobsUpdate(resp, 1, 'unhide').jobs).toHaveLength(0)
  })
})

describe('removalConfirmationText', () => {
  it('names contacts and history counts exactly when known', () => {
    const text = removalConfirmationText({ jobTitle: 'Staff Eng', contactCount: 2, activityCount: 0 })
    expect(text).toContain('Staff Eng')
    expect(text).toContain('2 private contacts')
    expect(text).toContain('no activity history')
    expect(text).toContain('stays in the shared catalog')
  })
  it('uses singular phrasing for one contact', () => {
    expect(removalConfirmationText({ contactCount: 1 })).toContain('1 private contact')
  })
  it('falls back to generic wording when counts are unknown', () => {
    const text = removalConfirmationText({ jobTitle: 'Role' })
    expect(text).toContain('any private contacts you added')
    expect(text).toContain('interview-stage activity history')
  })
})
