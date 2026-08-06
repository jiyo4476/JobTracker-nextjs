import { request, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { ADMIN, type E2EIdentity } from './identities'

/**
 * A same-origin API client for one simulated identity. The explicit `origin` header is
 * what satisfies `isSameOrigin()` in `src/lib/auth.ts`; without it the dev escape does not
 * apply and every call would 401 — which is the correct production behaviour.
 */
export async function apiFor(identity: E2EIdentity): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: identity.origin,
    extraHTTPHeaders: { origin: identity.origin },
  })
}

/** A browser page bound to one identity's origin. Each identity gets its own context, so
 *  cookies, storage and the React Query cache are never shared between the two users. */
export async function pageFor(browser: Browser, identity: E2EIdentity): Promise<Page> {
  const context = await browser.newContext({ baseURL: identity.origin })
  return context.newPage()
}

/** Seeds a catalog posting through the REAL admin API (POST /api/admin/jobs). */
export async function createCatalogJob(title: string): Promise<number> {
  const api = await apiFor(ADMIN)
  try {
    const response = await api.post('/api/admin/jobs', {
      data: { job_title: title, job_location: 'Austin, TX', is_remote: true },
    })
    if (response.status() !== 201) {
      throw new Error(`Seeding a catalog job failed: ${response.status()} ${await response.text()}`)
    }
    const { job_id } = await response.json() as { job_id: number }
    return job_id
  } finally {
    await api.dispose()
  }
}

/** Soft-deletes the seeded posting so repeated local runs do not accumulate catalog rows. */
export async function deleteCatalogJob(jobId: number): Promise<void> {
  const api = await apiFor(ADMIN)
  try {
    await api.delete(`/api/admin/jobs/${jobId}`)
  } finally {
    await api.dispose()
  }
}

export type PersonalState = {
  isTracked: boolean
  userState: {
    interviewStage: string
    priority: number | null
    notes: string | null
  } | null
  contacts: Array<{ name: string }>
}

/** Reads one identity's OWN view of a job. Used to cross-check what the other user sees. */
export async function personalState(identity: E2EIdentity, jobId: number): Promise<PersonalState> {
  const api = await apiFor(identity)
  try {
    const response = await api.get(`/api/jobs/${jobId}`)
    if (!response.ok()) throw new Error(`[${identity.name}] GET /api/jobs/${jobId} → ${response.status()}`)
    return await response.json() as PersonalState
  } finally {
    await api.dispose()
  }
}
