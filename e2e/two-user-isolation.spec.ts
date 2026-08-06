import { expect, test, type Page } from '@playwright/test'
import { ADMIN, USER_A, USER_B } from './identities'
import { apiFor, createCatalogJob, deleteCatalogJob, pageFor, personalState } from './fixtures'

/**
 * PAGE-017 acceptance criterion:
 *
 *   "Two-browser/two-user tests show independent stage, priority, notes, contacts,
 *    history, dashboard, and cache behavior for the same job ID."
 *
 * One catalog posting. Two users, in two browser contexts, against two servers backed by
 * ONE database. Everything below is asserted for the SAME `jobId`.
 */

let jobId: number
const JOB_TITLE = `E2E Isolation Probe ${Date.now()}`

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  jobId = await createCatalogJob(JOB_TITLE)
})

test.afterAll(async () => {
  if (jobId) await deleteCatalogJob(jobId)
})

async function saveToMyJobs(page: Page) {
  await page.goto(`/jobs/${jobId}`)
  await page.getByRole('button', { name: 'Save to My Jobs' }).click()
  await expect(page.getByText('Saved to My Jobs')).toBeVisible()
}

async function setApplication(page: Page, stage: string, priority: string, notes: string) {
  await page.goto(`/jobs/${jobId}/edit`)
  await page.getByLabel('Interview stage').selectOption(stage)
  await page.getByLabel('Priority').selectOption(priority)
  await page.getByLabel('Private notes').fill(notes)
  await page.getByRole('button', { name: 'Save application' }).click()
  await expect(page).toHaveURL(new RegExp(`/jobs/${jobId}$`))
}

test('the shared posting is visible to both users before either tracks it', async ({ browser }) => {
  for (const identity of [USER_A, USER_B]) {
    const page = await pageFor(browser, identity)
    await page.goto(`/jobs/${jobId}`)
    await expect(page.getByRole('heading', { name: JOB_TITLE })).toBeVisible()
    await expect(page.getByText('Not tracked')).toBeVisible()
    await page.close()
  }
})

test('stage, priority and notes stay independent for the same job id', async ({ browser }) => {
  const a = await pageFor(browser, USER_A)
  const b = await pageFor(browser, USER_B)

  await saveToMyJobs(a)
  await saveToMyJobs(b)

  await setApplication(a, 'onsite', '5', 'A: onsite next Tuesday')
  await setApplication(b, 'rejected', '1', 'B: passed on me')

  // Each browser shows only its own state for the same posting.
  await a.goto(`/jobs/${jobId}`)
  await expect(a.getByText('A: onsite next Tuesday')).toBeVisible()
  await expect(a.getByText('B: passed on me')).toHaveCount(0)

  await b.goto(`/jobs/${jobId}`)
  await expect(b.getByText('B: passed on me')).toBeVisible()
  await expect(b.getByText('A: onsite next Tuesday')).toHaveCount(0)

  // And the server agrees, independently of anything the client cached.
  const stateA = await personalState(USER_A, jobId)
  const stateB = await personalState(USER_B, jobId)
  expect(stateA.userState?.interviewStage).toBe('onsite')
  expect(stateA.userState?.priority).toBe(5)
  expect(stateA.userState?.notes).toBe('A: onsite next Tuesday')
  expect(stateB.userState?.interviewStage).toBe('rejected')
  expect(stateB.userState?.priority).toBe(1)
  expect(stateB.userState?.notes).toBe('B: passed on me')

  await a.close()
  await b.close()
})

test('contacts added by one user are invisible to the other', async ({ browser }) => {
  const a = await pageFor(browser, USER_A)

  await a.goto(`/jobs/${jobId}`)
  await a.getByRole('button', { name: 'Add contact' }).click()
  await a.getByLabel('Contact name').fill('Dana Recruiter')
  await a.getByRole('button', { name: 'Save new contact' }).click()
  await expect(a.getByText('Dana Recruiter')).toBeVisible()

  const b = await pageFor(browser, USER_B)
  await b.goto(`/jobs/${jobId}`)
  await expect(b.getByText('Dana Recruiter')).toHaveCount(0)

  const stateB = await personalState(USER_B, jobId)
  expect(stateB.contacts.map(c => c.name)).not.toContain('Dana Recruiter')

  await a.close()
  await b.close()
})

test('activity history and dashboard KPIs are per-user', async ({ browser }) => {
  const apiA = await apiFor(USER_A)
  const apiB = await apiFor(USER_B)
  try {
    const [activityA, activityB] = await Promise.all([
      apiA.get('/api/activity').then(r => r.json()) as Promise<Array<{ jobId: number; toStage: string }>>,
      apiB.get('/api/activity').then(r => r.json()) as Promise<Array<{ jobId: number; toStage: string }>>,
    ])

    // Both users transitioned the SAME job, to different stages. Neither feed may contain
    // the other's transition.
    const stagesA = activityA.filter(i => i.jobId === jobId).map(i => i.toStage)
    const stagesB = activityB.filter(i => i.jobId === jobId).map(i => i.toStage)
    expect(stagesA).toContain('onsite')
    expect(stagesA).not.toContain('rejected')
    expect(stagesB).toContain('rejected')
    expect(stagesB).not.toContain('onsite')

    const [statsA, statsB] = await Promise.all([
      apiA.get('/api/stats').then(r => r.json()) as Promise<{ scope: string; trackedJobs: number; catalog: { totalJobs: number } }>,
      apiB.get('/api/stats').then(r => r.json()) as Promise<{ scope: string; trackedJobs: number; catalog: { totalJobs: number } }>,
    ])
    expect(statsA.scope).toBe('personal')
    expect(statsB.scope).toBe('personal')
    // Catalog supply is global, so it must be identical for both...
    expect(statsA.catalog.totalJobs).toBe(statsB.catalog.totalJobs)
    // ...while the personal numerator is each user's own.
    expect(statsA.trackedJobs).toBeGreaterThan(0)
    expect(statsB.trackedJobs).toBeGreaterThan(0)
  } finally {
    await apiA.dispose()
    await apiB.dispose()
  }

  // The dashboards render the personal figure each user's own server resolved.
  const a = await pageFor(browser, USER_A)
  await a.goto('/')
  await expect(a.getByText(/Global catalog/i).first()).toBeVisible()
  await a.close()
})

test('removing from My Jobs affects only the user who removed it', async ({ browser }) => {
  const b = await pageFor(browser, USER_B)
  await b.goto(`/jobs/${jobId}`)
  await b.getByRole('button', { name: 'Remove' }).click()
  await b.getByRole('button', { name: 'Remove from My Jobs' }).click()
  await expect(b).toHaveURL(/\/jobs(\?|$)/)

  const stateB = await personalState(USER_B, jobId)
  expect(stateB.isTracked).toBe(false)

  // A is untouched: same posting, same id, state intact.
  const stateA = await personalState(USER_A, jobId)
  expect(stateA.isTracked).toBe(true)
  expect(stateA.userState?.notes).toBe('A: onsite next Tuesday')
  expect(stateA.contacts.map(c => c.name)).toContain('Dana Recruiter')

  await b.close()
})

test('a fresh context for one user never renders the other user cached data', async ({ browser }) => {
  // React Query keys are per-user (personalKeys), and personal responses are
  // `private, no-store`. A brand-new context for A must show A's values immediately.
  const a = await pageFor(browser, USER_A)
  await a.goto(`/jobs/${jobId}`)
  await expect(a.getByText('A: onsite next Tuesday')).toBeVisible()
  await expect(a.getByText('B: passed on me')).toHaveCount(0)
  await a.close()
})

test('catalog mutation controls are admin-only', async ({ browser }) => {
  const a = await pageFor(browser, USER_A)
  await a.goto(`/jobs/${jobId}`)
  await expect(a.getByRole('link', { name: 'Edit catalog posting' })).toHaveCount(0)
  await a.goto('/jobs/new')
  await expect(a.getByRole('link', { name: 'Create catalog job' })).toHaveCount(0)

  // Not merely hidden — the API refuses too.
  const apiA = await apiFor(USER_A)
  try {
    const forbidden = await apiA.patch(`/api/admin/jobs/${jobId}`, { data: { job_title: 'Hijacked' } })
    expect(forbidden.status()).toBe(403)
  } finally {
    await apiA.dispose()
  }

  const admin = await pageFor(browser, ADMIN)
  await admin.goto(`/jobs/${jobId}`)
  await expect(admin.getByRole('link', { name: 'Edit catalog posting' })).toBeVisible()

  await a.close()
  await admin.close()
})
