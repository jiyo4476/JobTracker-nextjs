// PAGE-017: pure helpers for the personal job-state (user_job_state) UI cutover.
// Extracted from the mutation hooks so the optimistic-cache transforms and the
// removal-confirmation copy can be unit-tested without a DOM or a query client.

import type { JobListItem, JobScope, JobsResponse } from '@/types/queries'

// The four personal row actions, each mapped to a request against
// PUT/PATCH/DELETE /api/jobs/[id]/state.
export type JobStateAction = 'save' | 'hide' | 'unhide' | 'remove'

// Apply a personal action to a single list row's overlay flags. Catalog facts are
// never touched. `remove` clears the whole personal overlay back to the untracked
// shape so a catalog-scope row reflects "Not tracked" immediately.
export function applyJobStateAction(item: JobListItem, action: JobStateAction): JobListItem {
  switch (action) {
    case 'save':
      return { ...item, isTracked: true, isHidden: false }
    case 'hide':
      return { ...item, isTracked: true, isHidden: true }
    case 'unhide':
      return { ...item, isTracked: true, isHidden: false }
    case 'remove':
      return {
        ...item,
        isTracked: false,
        isHidden: false,
        interviewStage: null,
        hasApplied: null,
        dateApplied: null,
        heardBack: null,
        priority: null,
      }
  }
}

// Does a row still belong in a list rendered under `scope`? Used to drop rows that
// an optimistic action moves out of the current view (e.g. hiding a row in My Jobs).
export function itemBelongsToScope(item: JobListItem, scope: JobScope): boolean {
  switch (scope) {
    case 'catalog':
      return true
    case 'tracked':
      return item.isTracked && !item.isHidden
    case 'hidden':
      return item.isTracked && item.isHidden
  }
}

// Produce the next JobsResponse after optimistically applying `action` to one job.
// Rows that leave the response's scope are removed and `total` is decremented to
// match, so the footer count and the visible rows stay consistent pre-refetch.
export function optimisticJobsUpdate(
  response: JobsResponse,
  jobId: number,
  action: JobStateAction,
): JobsResponse {
  const jobs = response.jobs
    .map((job) => (job.id === jobId ? applyJobStateAction(job, action) : job))
    .filter((job) => itemBelongsToScope(job, response.scope))
  const removed = response.jobs.length - jobs.length
  return { ...response, jobs, total: Math.max(0, response.total - removed) }
}

// Confirmation copy for "Remove from My Jobs". The text must state exactly which
// private records are deleted. Counts are optional: the list row does not know them,
// the detail page does. Zero counts are still enumerated as "no …" so the user is
// never surprised by a silent cascade.
export function removalConfirmationText(options?: {
  jobTitle?: string | null
  contactCount?: number
  activityCount?: number
}): string {
  const subject = options?.jobTitle ? `“${options.jobTitle}”` : 'this job'
  const parts: string[] = ['your saved application state (stage, priority, notes, dates)']

  if (options?.contactCount === undefined) {
    parts.push('any private contacts you added')
  } else {
    parts.push(
      options.contactCount === 0
        ? 'no contacts (you have none saved)'
        : `${options.contactCount} private contact${options.contactCount === 1 ? '' : 's'}`,
    )
  }

  if (options?.activityCount === undefined) {
    parts.push('your interview-stage activity history')
  } else {
    parts.push(
      options.activityCount === 0
        ? 'no activity history (none recorded)'
        : `${options.activityCount} activity-history ${options.activityCount === 1 ? 'entry' : 'entries'}`,
    )
  }

  const last = parts.pop()
  return (
    `Remove ${subject} from My Jobs? This permanently deletes ` +
    `${parts.join(', ')}, and ${last}. The job stays in the shared catalog.`
  )
}
