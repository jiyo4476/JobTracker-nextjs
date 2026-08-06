/**
 * PAGE-017 — React Query key factory with an explicit identity boundary.
 *
 * ## Why
 *
 * Every personal read (`/api/jobs`, `/api/jobs/[id]`, `/api/stats`, `/api/activity`,
 * `/api/companies/[id]`, `/api/resume-versions`, `/api/user-skills`,
 * `/api/user-taxonomies/*`) is owner-scoped server-side and served `private, no-store`.
 * The client cache, however, used identity-free roots (`['jobs']`, `['job', id]`,
 * `['stats']`, …). With those keys a second identity in the same tab could read the
 * previous identity's cached rows before the network answered. Keying on the
 * server-resolved `users.id` from `GET /api/me` makes that structurally impossible:
 * a different user simply has different cache entries.
 *
 * ## The two families
 *
 * **Personal (user-scoped).** Key shape is `[root, USER_SCOPE_SEGMENT, userId, …rest]`.
 * The root stays first so every existing broad invalidation (`{ queryKey: ['jobs'] }`,
 * `{ queryKey: ['companies'] }`, …) still matches by prefix — React Query matches keys
 * left-to-right — while the cached *value* can never be shared across identities.
 * Personal queries are `enabled` only once `/api/me` has resolved a `user_id`.
 *
 * **Catalog-global (identity-free).** The shared job catalog is the same bytes for every
 * signed-in user, so caching it once is correct and cheaper. These deliberately keep
 * identity-free keys:
 *
 * | Key            | Endpoint                          | Why it is safe to share |
 * |----------------|-----------------------------------|-------------------------|
 * | `['companies']`| `GET /api/companies`              | Catalog company metadata + global posting counts only; no per-user counts (see the route comment). |
 * | `['skills']` / `['software']` / `['certifications']` | lookup catalogs | Global taxonomy usage counts. |
 * | `['tags', …]`  | `GET /api/tags`                   | Global lookup autocomplete. |
 * | `['analytics', …]` | `GET /api/analytics`, `/analytics/taxonomy`, `/analytics/skills-by-clearance` | Catalog-wide posting demand; contains no `user_job_state`. |
 *
 * NOTE the deliberate asymmetry: `['companies']` (the list) is global, but the company
 * DETAIL (`GET /api/companies/[id]`) returns `trackedJobCount` and the caller's own
 * tracked jobs, so it is personal and uses `personalKeys.company`.
 *
 * `['me']` itself is identity-free by necessity — it is the query that *establishes*
 * identity. The provider's identity boundary removes user-scoped entries whenever its
 * `user_id` changes.
 */

import type { JobsParams, AnalyticsParams, TaxonomyAnalyticsParams, TaxonomyCategory, UserTaxonomyCategory } from '@/types/queries'
import type { TagLookupType } from '@/types/queries'

/** The server-resolved `users.id`, or `undefined` while `/api/me` is still pending. */
export type UserScopeId = number

/**
 * Marker segment separating a query root from the owner it belongs to.
 *
 * Deliberately not a bare `'u'`: the owner checks below are positional, so any catalog
 * key whose second segment happened to equal the sentinel (with a number third) would be
 * misread as personal. No current `TagLookupType` collides, but a distinctive literal
 * removes the latent hazard. It stays a STRING because React Query hashes keys with
 * `JSON.stringify`, which serializes a `Symbol` inside an array to `null` — a symbol
 * sentinel would silently collapse into any key carrying a literal `null` there.
 */
export const USER_SCOPE_SEGMENT = '__user__' as const

/**
 * Catalog-global keys. Identical for every identity — intentionally NOT user-scoped.
 * Never add a key here whose endpoint reads `user_job_state` or any other owned table.
 */
export const catalogKeys = {
  me: () => ['me'] as const,
  companies: () => ['companies'] as const,
  skills: () => ['skills'] as const,
  software: () => ['software'] as const,
  certifications: () => ['certifications'] as const,
  tags: (type: TagLookupType, q: string) => ['tags', type, q] as const,
  tagsByIds: (type: TagLookupType, ids: string) => ['tags', type, 'ids', ids] as const,
  analytics: (params?: AnalyticsParams) => ['analytics', params] as const,
  taxonomyAnalytics: (params: TaxonomyAnalyticsParams) => ['analytics', 'taxonomy', params] as const,
  taxonomyClearanceComparison: (category: TaxonomyCategory) =>
    ['analytics', 'taxonomy-clearance-comparison', category] as const,
} as const

/**
 * Personal keys. Shape: `[root, USER_SCOPE_SEGMENT, userId, …rest]` — root first so
 * broad prefix invalidations keep working, owner second so no two identities collide.
 */
export const personalKeys = {
  jobs: (userId: UserScopeId, params: JobsParams) =>
    ['jobs', USER_SCOPE_SEGMENT, userId, params] as const,
  job: (userId: UserScopeId, id: string | number) =>
    ['job', USER_SCOPE_SEGMENT, userId, String(id)] as const,
  stats: (userId: UserScopeId) => ['stats', USER_SCOPE_SEGMENT, userId] as const,
  activity: (userId: UserScopeId) => ['activity', USER_SCOPE_SEGMENT, userId] as const,
  company: (userId: UserScopeId, id: number) =>
    ['companies', USER_SCOPE_SEGMENT, userId, id] as const,
  resumeVersions: (userId: UserScopeId) =>
    ['resume-versions', USER_SCOPE_SEGMENT, userId] as const,
  userSkills: (userId: UserScopeId) => ['user-skills', USER_SCOPE_SEGMENT, userId] as const,
  userTaxonomies: (userId: UserScopeId, category: UserTaxonomyCategory) =>
    ['user-taxonomies', USER_SCOPE_SEGMENT, userId, category] as const,
  userTaxonomyGap: (userId: UserScopeId, category: UserTaxonomyCategory) =>
    ['user-taxonomies', USER_SCOPE_SEGMENT, userId, category, 'gap'] as const,
} as const

/**
 * Broad, identity-agnostic prefixes used by mutation invalidations. Invalidating a root
 * marks every identity's entry stale, which is harmless (only the signed-in user's
 * queries are mounted) and keeps the pre-existing invalidation contract intact.
 */
export const personalRoots = {
  jobs: () => ['jobs'] as const,
  job: () => ['job'] as const,
  stats: () => ['stats'] as const,
  activity: () => ['activity'] as const,
  companies: () => ['companies'] as const,
  resumeVersions: () => ['resume-versions'] as const,
  userSkills: () => ['user-skills'] as const,
  userTaxonomies: () => ['user-taxonomies'] as const,
} as const

/**
 * True when `key` is a personal (user-scoped) key belonging to `userId`. Used by tests
 * and by the identity-change purge to reason about cache contents.
 */
export function isPersonalKeyFor(key: readonly unknown[], userId: UserScopeId): boolean {
  return key[1] === USER_SCOPE_SEGMENT && key[2] === userId
}

/** True when `key` carries an owner segment at all (i.e. it is personal, not catalog). */
export function isUserScopedKey(key: readonly unknown[]): boolean {
  return key[1] === USER_SCOPE_SEGMENT && typeof key[2] === 'number'
}
