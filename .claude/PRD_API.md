# Job Search Tracker — API PRD

**Version:** 1.0 | **Date:** June 2026 | **Author:** Jimmy Young | **Status:** Draft  
**Related PRDs:** [Next.js App PRD](PRD_NextJS_App.md) · [Python Scraper PRD](PRD_Scraper.md)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Database Schema](#2-database-schema)
3. [Route Reference](#3-route-reference)
4. [Scraper Webhook](#4-scraper-webhook)
5. [Authentication](#5-authentication)
6. [Error Handling](#6-error-handling)
7. [Open Questions — Resolved](#7-open-questions--resolved)
8. [Appendix A — Complete jobs Table](#appendix-a--complete-jobs-table)

---

## 1. Overview

All API routes live under `src/app/api/` as Next.js Route Handlers. All request and response bodies are JSON. `POST`, `PATCH`, and `DELETE` routes require `Authorization: Bearer <API_KEY>`.

The API is the single write path for all data. The Python scraper writes exclusively through `POST /api/scrape`; the Next.js UI writes through the other mutating routes. The database is never accessed directly from the scraper or from client components.

---

## 2. Database Schema

### 2.1 ENUMs

All defined in `src/db/schema.ts` and must exist in PostgreSQL before any inserts.

| Enum | Values |
|------|--------|
| `interview_stage_enum` | `not_applied` · `applied` · `phone_screen` · `technical_screen` · `onsite` · `offer_received` · `rejected` · `withdrawn` |
| `source_platform_enum` | `linkedin` · `indeed` · `glassdoor` · `dice` · `lever` · `greenhouse` · `workday` · `angellist` · `direct` · `other` |
| `job_type_enum` | `full_time` · `part_time` · `contract` · `internship` · `temp` · `freelance` |
| `experience_level_enum` | `entry` · `mid` · `senior` · `lead` · `executive` |
| `company_size_enum` | `1-10` · `11-50` · `51-200` · `201-500` · `501-1000` · `1001-5000` · `5000+` |
| `salary_type_enum` | `annual` · `hourly` |

### 2.2 Core Tables

#### `jobs` (central entity)

See [Appendix A](#appendix-a--complete-jobs-table) for the full column list.

Key design decisions:
- **Salary** — annual jobs: `salary_min`/`salary_max` as integer cents (e.g. $80,000 → `8000000`). Hourly jobs: `hourly_rate_min`/`hourly_rate_max` as `numeric(10,2)`. Computed `annual_equivalent_min`/`annual_equivalent_max` (hourly × 2080 × 100) enable unified salary filtering across both types. `salary_text` holds the raw display string.
- **Dedup key** — `UNIQUE(external_job_id, source_platform) WHERE external_job_id IS NOT NULL`
- **Soft delete** — `DELETE /api/jobs/[id]` sets `is_active = false` and `deleted_at`. Never hard-deletes.
- **Full-text search** — GIN index: `CREATE INDEX jobs_description_search_idx ON jobs USING GIN (to_tsvector('english', coalesce(job_description, '')));`

**Recommended indexes:** `(company_id)`, `(interview_stage)`, `(date_found DESC)`, `(is_active)`, `(source_platform)`, `(priority)`, `(last_scraped_at)`, GIN on `job_description`.

#### `companies`

Normalizes company names to prevent duplicates (`'Google'` vs `'Google LLC'`). `jobs.company_id` FK references this table.

| Field | Type | Notes |
|-------|------|-------|
| `id` | serial PK | |
| `name` | text UNIQUE NOT NULL | Canonical company name |
| `website` | text | |
| `industry` | text | e.g. Software, Finance, Healthcare |
| `size_range` | company_size_enum | |
| `hq_location` | text | |
| `glassdoor_url` | text | |
| `linkedin_url` | text | |
| `notes` | text | |
| `created_at` | timestamptz | |

**Migration note:** `jobs` gains `company_id int REFERENCES companies(id)`. Existing `company_name` text column kept as nullable during migration, then dropped after backfill.

#### `contacts`

Recruiters and hiring managers per job.

| Field | Type | Notes |
|-------|------|-------|
| `id` | serial PK | |
| `job_id` | int FK → jobs | |
| `name` | text NOT NULL | |
| `email` | text | |
| `phone` | text | |
| `role` | text | e.g. Technical Recruiter, Hiring Manager |
| `contacted_at` | date | |
| `notes` | text | |

#### Lookup Tables

`skills`, `software`, `keywords`, `certifications` — each: `id` serial PK + `name text UNIQUE NOT NULL`.

#### Junction Tables

| Table | Columns | Extra |
|-------|---------|-------|
| `job_skills` | `(job_id, skill_id)` PK | `is_required boolean DEFAULT true` |
| `job_software` | `(job_id, software_id)` PK | |
| `job_keywords` | `(job_id, keyword_id)` PK | |
| `job_certifications` | `(job_id, cert_id)` PK | `is_required boolean DEFAULT true` |

`is_required` on `job_skills` and `job_certifications` distinguishes required vs. preferred qualifications.

#### Additional Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `job_status_history` | Stage change log for the activity feed | `(job_id, from_stage, to_stage, changed_at)` |
| `resume_versions` | Resume variant labels referenced from `jobs.resume_version` | `(id, label, date, notes)` |
| `user_skills` | User's personal skill list for the skill gap tracker | `(skill_id PK FK → skills, has_skill boolean)` |

### 2.3 Deduplication Strategy

**Primary:** `UNIQUE(external_job_id, source_platform)` — same posting re-scraped from the same platform.

**Secondary:** fuzzy match on `(company_id, normalized_job_title, job_location)` within a 7-day window — catches cross-platform reposts of the same role. Normalized title comparison strips seniority prefixes (`Senior`, `Sr.`, `Lead`) and suffixes (`- Remote`, `(Contract)`) before comparing.

**Result:** `{ action: 'created' | 'updated' | 'duplicate_skipped', job_id }` on every scrape payload.

---

## 3. Route Reference

### 3.1 Jobs

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/jobs` | — | Paginated list with filtering and sorting |
| POST | `/api/jobs` | Bearer | Create job (manual entry) |
| GET | `/api/jobs/[id]` | — | Single job with all relations |
| PATCH | `/api/jobs/[id]` | Bearer | Partial update of any job field |
| DELETE | `/api/jobs/[id]` | Bearer | Soft delete — sets `is_active = false`, `deleted_at` |
| GET | `/api/jobs/[id]/description` | — | Return `job_description` only |

#### `GET /api/jobs` — Query Parameters

| Param | Type | Notes |
|-------|------|-------|
| `page` | int | Default 1 |
| `limit` | int | Default 25, max 100 |
| `q` | string | Full-text search on company, title, description |
| `stage` | string[] | Filter by `interview_stage` values (multi) |
| `platform` | string[] | Filter by `source_platform` (multi) |
| `job_type` | string[] | Filter by `job_type` (multi) |
| `experience_level` | string[] | Filter by `experience_level` (multi) |
| `is_remote` | boolean | |
| `is_active` | boolean | Default true |
| `skill_ids` | int[] | AND logic by default; pass `skill_op=or` for OR |
| `salary_min` | int | Annual cents lower bound (applied to `annual_equivalent_min` for hourly jobs) |
| `salary_max` | int | Annual cents upper bound |
| `salary_type` | `annual\|hourly\|all` | Restrict to one salary type |
| `priority_min` | int | Minimum priority (1–5) |
| `date_from` | date | Filter `date_posted` or `date_found` (pair with `date_field`) |
| `date_to` | date | |
| `date_field` | `posted\|found` | Default `found` |

#### `GET /api/jobs/[id]` — Response Shape

```json
{
  "id": 1,
  "company": { "id": 1, "name": "Acme Corp", ... },
  "job_title": "Senior Data Engineer",
  "interview_stage": "phone_screen",
  "skills": [{ "id": 1, "name": "Python", "is_required": true }],
  "software": [...],
  "keywords": [...],
  "certifications": [...],
  "contacts": [...]
}
```

---

### 3.2 Stats & Analytics

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/stats` | — | Dashboard aggregates |
| GET | `/api/analytics` | — | Time-series data for charts |

#### `GET /api/stats` — Response Shape

```json
{
  "total_jobs": 312,
  "applied": 47,
  "active_interviews": 3,
  "stale_listings": 18,
  "stage_counts": { "applied": 47, "phone_screen": 5, ... },
  "top_skills": [{ "name": "Python", "count": 198 }, ...],
  "weekly_counts": [{ "week": "2026-06-09", "count": 24 }, ...],
  "remote_pct": 0.62
}
```

#### `GET /api/analytics` — Query Parameters

| Param | Type | Notes |
|-------|------|-------|
| `date_from` | date | |
| `date_to` | date | |
| `platform` | string[] | Filter by source platform |

Response includes separate arrays for each chart (skill demand by month, salary distribution, response rate by platform, etc.).

---

### 3.3 Lookup Routes

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/skills` | — | All skills with usage count |
| GET | `/api/software` | — | All software with usage count |
| GET | `/api/certifications` | — | All certifications with usage count |

These power the autocomplete tag inputs in Add/Edit Job. Usage count = number of active jobs referencing each item.

---

### 3.4 Companies

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/companies` | — | List with job counts and avg salary |
| GET | `/api/companies/[id]` | — | Single company with linked jobs |
| PATCH | `/api/companies/[id]` | Bearer | Update company metadata |

#### `GET /api/companies` — Response Shape (per item)

```json
{
  "id": 1,
  "name": "Acme Corp",
  "industry": "Software",
  "size_range": "501-1000",
  "hq_location": "San Francisco, CA",
  "jobs_found": 12,
  "applied": 2,
  "avg_salary_max": 18500000
}
```

---

### 3.5 Scraper Webhook

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/scrape` | Bearer | Upsert job from scraper; returns `{ action, job_id }` |

See [Section 4](#4-scraper-webhook) for full payload schema and upsert logic.

---

### 3.6 Export

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/export` | Bearer | Full dataset download |

**Query params:** `format=csv` (default) or `format=json`.

CSV includes all `jobs` fields plus company name, skills, software, keywords, certifications (pipe-delimited within the cell).

---

## 4. Scraper Webhook

### 4.1 `POST /api/scrape` Payload Schema

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `source_platform` | Yes | enum | Platform the job was scraped from |
| `external_job_id` | Yes | string | Platform's own job ID — primary dedup key |
| `company_name` | Yes | string | Matched against `companies.name`; new company created if not found |
| `job_title` | Yes | string | |
| `job_link` | Yes | string | Canonical URL to the posting |
| `job_location` | No | string | |
| `is_remote` | No | boolean | Defaults `false` |
| `job_description` | No | string | Full text. If provided and tag arrays are empty, server runs NLP tag extraction. |
| `date_posted` | No | string | ISO date (YYYY-MM-DD) |
| `salary_text` | No | string | Raw string from posting; API parses to structured fields if recognizable |
| `salary_type` | No | `annual\|hourly` | Determines which pair of salary fields is used |
| `salary_min` | No | int | Cents; annual only. Overrides parsed value. |
| `salary_max` | No | int | Cents; annual only. |
| `hourly_rate_min` | No | float | Decimal dollars |
| `hourly_rate_max` | No | float | Decimal dollars |
| `job_type` | No | enum | |
| `experience_level` | No | enum | |
| `security_clearance_req` | No | boolean | |
| `skills` | No | string[] | Names. If empty and `job_description` present, server extracts them. |
| `software` | No | string[] | |
| `keywords` | No | string[] | |
| `certifications` | No | string[] | |

### 4.2 Upsert Logic

1. **Primary lookup** — find existing `jobs` row by `(external_job_id, source_platform)`. If found: update `last_scraped_at`, `is_active = true`, and any changed fields. Return `{ action: 'updated', job_id }`.
2. **Secondary fuzzy check** — if not found by primary key, check for `(company_id, normalized_job_title, job_location)` within a 7-day window. If matched: link cursor and return `{ action: 'duplicate_skipped', job_id }`. No insert.
3. **Insert** — upsert company via `INSERT INTO companies (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING id`. Insert new `jobs` row. Upsert all lookup tags via `INSERT ... ON CONFLICT DO NOTHING` and create junction rows. If `skills`/`software`/`keywords`/`certifications` arrays are empty and `job_description` is non-null, run server-side NLP extraction before inserting junction rows.
4. **Return** `{ action: 'created', job_id }`.

### 4.3 Response

```json
{ "action": "created" | "updated" | "duplicate_skipped", "job_id": 42 }
```

HTTP status: `200` for all outcomes including `duplicate_skipped` (not an error).

---

## 5. Authentication

`POST`, `PATCH`, and `DELETE` routes require:

```
Authorization: Bearer <API_KEY>
```

`API_KEY` is set as an environment variable in the Next.js runtime. The scraper reads it from `config.yml`. Requests without a valid key return `401`.

`GET` routes are unauthenticated — this is a single-user personal app.

---

## 6. Error Handling

| Status | Meaning |
|--------|---------|
| `200` | Success (including `duplicate_skipped`) |
| `201` | Created (new job row) |
| `400` | Zod validation failure — body includes `{ errors: [...] }` |
| `401` | Missing or invalid `Authorization` header |
| `404` | Resource not found |
| `500` | Unhandled server error |

All error responses: `{ "error": "human-readable message", "errors": [...] }`.

---

## 7. Open Questions — Resolved

| # | Question | Resolution |
|---|----------|------------|
| Q1 | Salary as cents or decimal? | Annual as integer cents; hourly as `numeric(10,2)`. Hourly normalized to annual equivalent cents on ingest. |
| Q2 | Cron schedule or on-demand scraping? | Cron every 6h. `last_scraped_at` index recommended. |
| Q3 | GIN index on `job_description`? | Yes — added via raw SQL migration after `db:generate`. |
| Q4 | Cross-platform duplicates — merged or shown as related? | Merged into one row via fuzzy match (see §4.2 step 2); first platform wins as canonical source. |

---

## Appendix A — Complete jobs Table

| Column | Type | Status |
|--------|------|--------|
| `id` | serial PK | Existing |
| `company_id` | int FK → companies | **NEW** — replaces `company_name` text |
| `job_title` | text NOT NULL | Existing |
| `job_link` | text | Existing |
| `job_location` | text | Existing |
| `is_remote` | boolean | Existing |
| `source_platform` | source_platform_enum | **NEW** |
| `external_job_id` | text | **NEW** |
| `job_type` | job_type_enum | **NEW** |
| `experience_level` | experience_level_enum | **NEW** |
| `job_description` | text | **NEW** |
| `salary_type` | salary_type_enum | **NEW** — `annual` or `hourly` |
| `salary_min` | integer (cents) | **NEW** — annual only |
| `salary_max` | integer (cents) | **NEW** — annual only |
| `hourly_rate_min` | numeric(10,2) | **NEW** — hourly only |
| `hourly_rate_max` | numeric(10,2) | **NEW** — hourly only |
| `annual_equivalent_min` | integer (cents) | **NEW** — computed: hourly × 2080 × 100 |
| `annual_equivalent_max` | integer (cents) | **NEW** — computed: hourly × 2080 × 100 |
| `salary_text` | text | **NEW** — raw display string |
| `salary_currency` | char(3) DEFAULT 'USD' | **NEW** |
| `has_applied` | boolean | Existing |
| `date_applied` | date | Existing |
| `heard_back` | boolean | Existing |
| `interview_stage` | interview_stage_enum | Existing |
| `date_posted` | date | Existing |
| `date_found` | date | Existing |
| `last_scraped_at` | timestamptz | **NEW** |
| `is_active` | boolean DEFAULT true | **NEW** |
| `deleted_at` | timestamptz | **NEW** — set on soft delete |
| `application_deadline` | date | **NEW** |
| `security_clearance_req` | boolean | Existing |
| `priority` | smallint 1–5 | **NEW** |
| `referral` | boolean DEFAULT false | **NEW** |
| `cover_letter_submitted` | boolean DEFAULT false | **NEW** |
| `resume_version` | text | **NEW** |
| `rejection_reason` | text | **NEW** |
| `notes` | text | Existing |
| `created_at` | timestamptz | Existing |
| `updated_at` | timestamptz | Existing |

**Unique constraint:** `UNIQUE(external_job_id, source_platform) WHERE external_job_id IS NOT NULL`

**Indexes:** `(company_id)`, `(interview_stage)`, `(date_found DESC)`, `(is_active)`, `(source_platform)`, `(priority)`, `(last_scraped_at)`, `(deleted_at)`, GIN on `to_tsvector('english', coalesce(job_description, ''))`
