# API-013 — Legacy response & path compatibility matrix

Status of every transitional surface introduced by the owner-scoped cutover (API-013,
PRs #86–#93): what a client can still rely on, what replaces it, and which test asserts
it. **Every row below was derived by reading the route handler and its test — nothing here
is aspirational.**

Legend for **Status**:

| value | meaning |
| --- | --- |
| `active` | Current contract. Not going away in this task. |
| `transitional` | Emitted today for client compatibility; superseded by a nested/explicit field. Removal is a future breaking change, not scheduled here. |
| `deprecated-alias` | Path still works but emits `Deprecation: true` + `Link: <successor>; rel="successor-version"`. Scheduled for removal once no client calls it. |
| `removed` | Already gone. Listed so the break is documented rather than folklore. |

---

## 1. Deprecated route aliases (catalog mutation)

Slice 1 moved catalog mutation into `/api/admin/jobs…`. The old paths remain as
**admin-gated aliases** sharing one implementation (`src/lib/admin-catalog-handlers.ts`)
and wrapped by `deprecatedAlias()` (`src/lib/http.ts`), which sets both headers on every
response — including error responses, since it annotates whatever the inner handler
returns.

| Legacy path | Successor | Status | Notes | Test |
| --- | --- | --- | --- | --- |
| `POST /api/jobs` | `POST /api/admin/jobs` | `deprecated-alias` | Admin-only. Ordinary users add a catalog job to their tracker via `PUT /api/jobs/[id]/state`. | `api.jobs.test.ts` (201 + headers), `api.legacy-compat.test.ts` (`Link` successor) |
| `PATCH /api/jobs/[id]` | `PATCH /api/admin/jobs/[id]` | `deprecated-alias` | Catalog fields only; `jobCatalogPatchSchema` is `.strict()` and rejects personal-state keys. | `api.jobs-id.test.ts` (200 + headers, personal-field rejection), `api.legacy-compat.test.ts` (headers on 4xx too) |
| `DELETE /api/jobs/[id]` | `DELETE /api/admin/jobs/[id]` | `deprecated-alias` | Global soft-delete (`is_active=false`, `deleted_at`). **Not** "remove from my tracker" — that is `DELETE /api/jobs/[id]/state`. | `api.jobs-id.test.ts` (200 + `Deprecation`), `api.legacy-compat.test.ts` (`Link` successor) |
| `PATCH /api/jobs/[id]/salary` | `PATCH /api/admin/jobs/[id]/salary` | `deprecated-alias` | Admin-only. | `api.job-tags-salary.test.ts` (401/403/200 behaviour), `api.legacy-compat.test.ts` (headers) |
| `PATCH /api/jobs/[id]/tags` | `PATCH /api/admin/jobs/[id]/tags` | `deprecated-alias` | Admin-only. | `api.job-tags-salary.test.ts` (403/400 behaviour), `api.legacy-compat.test.ts` (headers) |

`GET /api/jobs/[id]/description` and `POST /api/scrape` are **not** aliases — they keep
their canonical paths (`/description` is a catalog read; `/scrape` is the service-principal
ingest path).

---

## 2. `GET /api/jobs` — list rows

Source: `src/app/api/jobs/route.ts`. Personal columns come from a join on
`user_job_state` whose ON clause pins `user_id` to the resolved caller.

| Legacy / flattened field | Successor | Status | Notes | Test |
| --- | --- | --- | --- | --- |
| `priority` | `user_job_state.priority` | `transitional` | `null` on untracked rows (catalog scope). | `api.legacy-compat.test.ts` |
| `interviewStage` | `user_job_state.interview_stage` | `transitional` | `null` on untracked rows. | `api.legacy-compat.test.ts` |
| `hasApplied` | `user_job_state.has_applied` | `transitional` | `null` on untracked rows. | `api.legacy-compat.test.ts` |
| `dateApplied` | `user_job_state.date_applied` | `transitional` | `null` on untracked rows. | `api.legacy-compat.test.ts` |
| `heardBack` | `user_job_state.heard_back` | `transitional` | `null` on untracked rows. | `api.legacy-compat.test.ts` |
| `isTracked` | — (this *is* the successor) | `active` | Derived from whether the owner-scoped join matched. Replaces "stage is non-null ⇒ tracked" inference. | `api.jobs.test.ts`, `api.legacy-compat.test.ts` |
| `isHidden` | — (this *is* the successor) | `active` | Coerced to `false` when the join misses. | `api.jobs.test.ts`, `api.legacy-compat.test.ts` |
| `stateUserId` | — | `removed` | Internal join marker; stripped before serialization and must never appear. | `api.jobs.test.ts` (`not.toHaveProperty`) |
| nested `userState` | — | *not emitted on list rows* | Only `GET /api/jobs/[id]` carries the nested shape. List rows stay flat for table rendering. | `api.legacy-compat.test.ts` (asserts absence) |
| `scope` | — | `active` | New required response field: `tracked` \| `catalog` \| `hidden`; defaults to `tracked`. | `api.jobs.test.ts` |
| response `Cache-Control` | — | `active` | `private, no-store` on every personal response. | `api.jobs.test.ts` |

Personal **filters/sorts** (`stage`, `has_applied`, `priority_min`, `sort_by=stage|priority`)
now read `user_job_state` rather than the legacy `jobs` columns; the query-parameter names
are unchanged, so no client change was required. Asserted in `api.jobs.test.ts`.

---

## 3. `GET /api/jobs/[id]` — detail

Source: `src/app/api/jobs/[id]/route.ts`. This is the one route that emits **both** the
flattened fields and the nested `userState` object — the versioned successor contract.

| Legacy / flattened field | Successor | Status | Untracked default | Test |
| --- | --- | --- | --- | --- |
| `priority` | `userState.priority` | `transitional` | `null` | `api.legacy-compat.test.ts` |
| `interviewStage` | `userState.interviewStage` | `transitional` | `null` | `api.legacy-compat.test.ts` |
| `hasApplied` | `userState.hasApplied` | `transitional` | `false` | `api.legacy-compat.test.ts` |
| `dateApplied` | `userState.dateApplied` | `transitional` | `null` | `api.legacy-compat.test.ts` |
| `heardBack` | `userState.heardBack` | `transitional` | `false` | `api.legacy-compat.test.ts` |
| `referral` | `userState.referral` | `transitional` | `false` | `api.legacy-compat.test.ts` |
| `coverLetterSubmitted` | `userState.coverLetterSubmitted` | `transitional` | `false` | `api.legacy-compat.test.ts` |
| `rejectionReason` | `userState.rejectionReason` | `transitional` | `null` | `api.legacy-compat.test.ts` |
| `notes` | `userState.notes` | `transitional` | `null` | `api.legacy-compat.test.ts` |
| `isTracked` / `isHidden` | — | `active` | `false` / `false` | `api.jobs-id.test.ts`, `api.legacy-compat.test.ts` |
| `userState` | — | `active` | `null` | `api.jobs-id.test.ts`, `api.legacy-compat.test.ts` |
| `selectedResume` | — | `active` | `null`; resolved only when `userState.resumeVersionId` belongs to the caller. | `api.jobs-id.test.ts` |
| `contacts[]` | — | `active` | `[]`; now sourced from `user_job_contacts`, a **stable superset** of the old `contacts` row shape. | `api.jobs-id.test.ts`, `api.contacts.test.ts` |
| legacy `jobs.resume_version` (text) | `userState.resumeVersionId` + `selectedResume` | `removed` | Not selected by any handler. | — (absence verified by `grep`; see §7) |

**Invariant**: when a state row exists, each flattened field is the same value as its
`userState.*` counterpart — a client may read either during the transition. Asserted
field-by-field in `api.legacy-compat.test.ts`.

---

## 4. Personal-state mutations

Source: `src/app/api/jobs/[id]/state/route.ts`.

| Surface | Status | Notes | Test |
| --- | --- | --- | --- |
| `PUT /api/jobs/[id]/state` | `active` | Idempotent replace; omitted fields reset to `STATE_DEFAULTS`. | `api.jobs-state.test.ts` |
| `PATCH /api/jobs/[id]/state` | `active` | Partial merge; omitted ≠ explicit `null`. | `api.jobs-state.test.ts` |
| `DELETE /api/jobs/[id]/state` | `active` | "Remove from my tracker". Contacts + history cascade. Distinct from the deprecated `DELETE /api/jobs/[id]` catalog soft-delete. | `api.jobs-state.test.ts` |
| snake_case request bodies (`interview_stage`, `has_applied`, …) | `active` | Body casing intentionally matches the pre-cutover job PATCH body, so form payloads port over unchanged. | `api.jobs-state.test.ts`, `schemas.test.ts` |
| response body = raw `user_job_state` row (camelCase) | `active` | Not the flattened job shape — mutations return state only. | `api.jobs-state.test.ts` |

---

## 5. Contacts

Source: `src/app/api/jobs/[id]/contacts/**`. Slice 3 repointed these from the global
`contacts` table to owner-scoped `user_job_contacts`.

| Surface | Status | Notes | Test |
| --- | --- | --- | --- |
| `GET/POST /api/jobs/[id]/contacts`, `PATCH/DELETE …/[contactId]` | `active` | Paths unchanged. Response shapes are **stable supersets** of the old `contacts` rows, so no client change was required. | `api.contacts.test.ts` |
| `POST` materializing a default `user_job_state` row | `active` | Composite FK `(user_id, job_id)` requires it. No history row is emitted (stage is unchanged). | `api.contacts.test.ts` |
| smuggled `user_id` / `job_id` in the body | `removed` | `.strict()` schemas reject them with 400. | `api.contacts.test.ts` |

---

## 6. Aggregates, activity, export, companies

| Surface | Legacy shape | Successor | Status | Test |
| --- | --- | --- | --- | --- |
| `GET /api/stats` | top-level `totalJobs`, `topSkills`, `weeklyJobCounts`, `remoteCount`, `onsiteCount` | `catalog.{…}` block; personal KPIs (`trackedJobs`, `applied`, `activeInterviews`, `staleListings`, `stageCounts`) stay top-level with `scope: 'personal'` | `removed` (break landed in PR #88; UI cut over) | `api.stats.test.ts`, `components.dashboard-page.test.tsx` |
| `GET /api/activity` | global history + `s-maxage` shared cache | caller's `user_job_status_history`; `private, no-store` | `removed` | `api.activity.test.ts` |
| `GET /api/export` | all jobs, personal columns from `jobs` | caller's non-hidden tracked state joined to catalog facts. **Column names and CSV header order are unchanged**, so existing spreadsheets keep working. | `active` (rows narrowed, shape preserved) | `api.export.test.ts` |
| `GET /api/companies/[id]` → `jobs[].interviewStage` | global `jobs.interview_stage` | caller's `user_job_state.interview_stage`; `null` when untracked | `active` (same key, personal source) | `api.companies.test.ts` |
| `GET /api/companies/[id]` → `trackedJobCount` | — | new personal counter, distinct from the global `taxonomyDemand.activeJobCount` | `active` | `api.companies.test.ts` |
| `GET /api/companies` (list) | — | stays catalog-global; no personal fields | `active` | `api.companies.test.ts` |
| `/api/analytics`, `/api/analytics/taxonomy`, `/api/analytics/skills-by-clearance` | implicit scope | explicit `scope: 'catalog'` in the response | `active` | `api.analytics.test.ts`, `api.analytics.taxonomy.test.ts`, `api.analytics.skills-by-clearance.test.ts` |

---

## 7. Legacy columns that are no longer read

The EXPAND-phase personal columns still exist on `jobs` (`has_applied`, `date_applied`,
`heard_back`, `interview_stage`, `priority`, `referral`, `cover_letter_submitted`,
`resume_version`, `rejection_reason`, `notes`) but **no route handler selects or writes
them any more**. They are held for the DB-002 contract phase and dropped there, not here.

Verify with:

```bash
grep -rn "jobs\.\(interviewStage\|priority\|hasApplied\|notes\|dateApplied\|heardBack\|resumeVersion\|referral\|coverLetterSubmitted\|rejectionReason\)" src/app src/lib
```

Expected output: empty.

---

## Retirement plan for the `transitional` rows

The flattened personal fields in §2 and §3 stay until the UI reads exclusively from
`userState` (`JobDetail`) and the list overlay. Removing them is a **breaking** response
change and needs its own task — it is deliberately *not* part of API-013's closeout.
Precondition for scheduling it: no client (web UI, Chrome extension) reads a flattened
personal field, verified by `grep` over `src/` plus a release note for the extension.
