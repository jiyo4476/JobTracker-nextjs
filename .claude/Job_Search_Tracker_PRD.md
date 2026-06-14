# Job Search Tracker — Product Requirements Document

**Version:** 1.0 | **Date:** June 2026 | **Author:** Jimmy Young | **Status:** Draft

---

## Table of Contents

1. [Overview](#1-overview)
2. [Problem Statement](#2-problem-statement)
3. [Goals & Success Metrics](#3-goals--success-metrics)
4. [ERD Gap Analysis & Schema Recommendations](#4-erd-gap-analysis--schema-recommendations)
5. [Feature Specifications](#5-feature-specifications)
6. [API Specification](#6-api-specification)
7. [Technical Architecture](#7-technical-architecture)
8. [Out of Scope — MVP](#8-out-of-scope--mvp)
9. [Open Questions](#9-open-questions)
10. [Appendix A — Complete Updated jobs Table](#appendix-a--complete-updated-jobs-table)

---

## 1. Overview

The Job Search Tracker is a personal Next.js web application that centralizes and analyzes jobs scraped from multiple job boards (LinkedIn, Indeed, Glassdoor, Dice, and company career pages). It stores structured data in PostgreSQL, visualizes trends in skills demanded, salary ranges, and application pipeline health, and helps the user manage their job search end-to-end from discovery through offer.

| Attribute | Value |
|-----------|-------|
| Platform | Next.js 14+ (App Router) with Strict TypeScript |
| Database | PostgreSQL 16 via Drizzle ORM |
| Hosting | Vercel (app) + Railway or Supabase (DB) |
| Audience | Single user — personal job search dashboard |
| Scope | MVP: 7 pages, REST-style API routes, read/write UI |

---

## 2. Problem Statement

Managing a job search across multiple platforms creates fragmented data that is hard to analyze. Spreadsheets lose structure as the search grows; job board UIs don't persist your own notes or cross-reference skill trends. Key pain points:

- No single view of all saved jobs, statuses, and skill requirements
- Impossible to spot which skills appear most frequently without manual counting
- Application follow-up is manually tracked and easy to miss
- Salary data is inconsistently formatted, making comparison difficult
- Duplicate postings from different platforms inflate job counts

---

## 3. Goals & Success Metrics

### 3.1 Goals

- Aggregate scraped jobs into a single structured store with deduplication
- Surface skill, software, and certification frequency across all open roles
- Track the full application lifecycle from discovery to offer or rejection
- Provide salary range visibility and filtering
- Detect and flag stale or removed postings within 48 hours

### 3.2 Success Metrics

| Metric | Target |
|--------|--------|
| Jobs ingested per scrape run | > 95% stored without duplicates |
| Stale listing detection | Flagged within 48h of removal |
| Dashboard load time | < 1.5s initial load (cached stats) |
| Application status update | User can update stage in < 3 clicks |
| Skill trend chart render | < 500ms for top-20 skills |

---

## 4. ERD Gap Analysis & Schema Recommendations

The existing schema is well-structured for manual tracking. To support web scraping, salary analysis, deduplication, and richer filtering, the following additions are required.

### 4.1 Current Schema Summary

**jobs (existing fields):**
`id`, `company_name`, `job_title`, `job_link`, `job_location`, `is_remote`, `has_applied`, `date_applied`, `heard_back`, `interview_stage`, `date_posted`, `date_found`, `security_clearance_req`, `notes`, `created_at`, `updated_at`

**Lookup tables (existing):** `skills`, `software`, `keywords`, `certifications` — each with `id` + `name (UNIQUE)`

**Junction tables (existing):** `job_skills`, `job_software`, `job_keywords`, `job_certifications` — composite PK only, no metadata columns

**interview_stage ENUM (existing):** `not_applied`, `applied`, `phone_screen`, `technical_screen`, `onsite`, `offer_received`, `rejected`, `withdrawn`

---

### 4.2 Missing Fields in the jobs Table

| Field | Type | Why Needed |
|-------|------|------------|
| `salary_min` | integer (cents) | Structured salary for range filtering & analytics |
| `salary_max` | integer (cents) | Upper bound of posted salary range |
| `salary_text` | text | Raw string from posting (e.g. `$80k–$120k/yr`) for display |
| `salary_currency` | char(3) DEFAULT `'USD'` | ISO currency code for multi-region support |
| `job_description` | text | Full scraped text — needed for display and NLP tag extraction |
| `source_platform` | source_platform_enum | Origin: `linkedin`, `indeed`, `glassdoor`, `dice`, `lever`, `greenhouse`, `workday`, `direct`, `other` |
| `external_job_id` | text | Platform job ID — enables deduplication on re-scrape |
| `job_type` | job_type_enum | `full_time`, `part_time`, `contract`, `internship`, `temp`, `freelance` |
| `experience_level` | experience_level_enum | `entry`, `mid`, `senior`, `lead`, `executive` |
| `is_active` | boolean DEFAULT true | Scraper marks false when posting is removed |
| `last_scraped_at` | timestamptz | Timestamp of most recent scraper verification |
| `priority` | smallint (1–5) | User-assigned interest level for triage and sorting |
| `application_deadline` | date | Deadline extracted from posting if present |
| `referral` | boolean DEFAULT false | Whether user has an internal referral |
| `cover_letter_submitted` | boolean DEFAULT false | Whether a cover letter was sent |
| `resume_version` | text | Label of resume variant used (e.g. `v3-data-engineer`) |
| `rejection_reason` | text | Freeform note on why application was rejected |

---

### 4.3 New Table: companies

Currently `company_name` is a free-text field in `jobs`, causing duplicates (`'Google'`, `'google inc'`, `'Google LLC'`). A normalized `companies` table enables deduplication, enrichment, and company-level analytics.

| Field | Type | Notes |
|-------|------|-------|
| `id` | serial PK | Primary key |
| `name` | text UNIQUE NOT NULL | Canonical company name |
| `website` | text | Company homepage URL |
| `industry` | text | e.g. Software, Finance, Healthcare |
| `size_range` | company_size_enum | `1-10`, `11-50`, `51-200`, `201-500`, `501-1000`, `1001-5000`, `5000+` |
| `hq_location` | text | City / state or country HQ |
| `glassdoor_url` | text | Link to Glassdoor company page |
| `linkedin_url` | text | Link to LinkedIn company page |
| `notes` | text | Personal notes on the company |
| `created_at` | timestamptz | |

**Migration note:** `jobs` gains `company_id int REFERENCES companies(id)`. The existing `company_name` text column is kept as a nullable alias during migration, then dropped after backfill.

---

### 4.4 New Table: contacts

Tracking recruiters and hiring managers per job is a key gap — currently only the `notes` field can hold this.

| Field | Type | Notes |
|-------|------|-------|
| `id` | serial PK | Primary key |
| `job_id` | int FK → jobs | The job this contact is associated with |
| `name` | text NOT NULL | Contact full name |
| `email` | text | Email address |
| `phone` | text | Phone number |
| `role` | text | e.g. Technical Recruiter, Hiring Manager |
| `contacted_at` | date | When contact was made |
| `notes` | text | Conversation notes |

---

### 4.5 Junction Table Enrichment

Add `is_required boolean` to `job_skills` and `job_certifications` junction tables. This distinguishes required vs. nice-to-have qualifications and enables personal skill gap analysis.

| Junction Table | New Column | Type | Purpose |
|----------------|------------|------|---------|
| `job_skills` | `is_required` | boolean DEFAULT true | Required vs. preferred skill |
| `job_certifications` | `is_required` | boolean DEFAULT true | Required vs. preferred certification |

---

### 4.6 Recommended ENUM Types

| Enum Name | Values |
|-----------|--------|
| `source_platform_enum` | `linkedin`, `indeed`, `glassdoor`, `dice`, `lever`, `greenhouse`, `workday`, `angellist`, `direct`, `other` |
| `job_type_enum` | `full_time`, `part_time`, `contract`, `internship`, `temp`, `freelance` |
| `experience_level_enum` | `entry`, `mid`, `senior`, `lead`, `executive` |
| `company_size_enum` | `1-10`, `11-50`, `51-200`, `201-500`, `501-1000`, `1001-5000`, `5000+` |
| `interview_stage_enum` (existing) | `not_applied`, `applied`, `phone_screen`, `technical_screen`, `onsite`, `offer_received`, `rejected`, `withdrawn` |

---

### 4.7 Deduplication Strategy

- **Primary:** `UNIQUE(external_job_id, source_platform)` — same posting re-scraped from the same platform
- **Secondary:** fuzzy match on `(company_id, job_title, job_location)` within a 7-day window — catches cross-platform duplicates
- The API returns `{ action: 'created' | 'updated' | 'duplicate_skipped', job_id }` on each scrape payload

---

## 5. Feature Specifications

The application has 7 pages sharing a persistent left navigation sidebar. Nav items: Dashboard, Jobs, Analytics, Companies, Settings.

---

### 5.1 Dashboard `/`

Landing page with an at-a-glance view of the entire job search.

**KPI Cards (top row)**

| Card | Metric |
|------|--------|
| Total Jobs | `COUNT(*) FROM jobs` |
| Applied | `WHERE has_applied = true` |
| Active Interviews | `WHERE interview_stage IN (phone_screen, technical_screen, onsite)` |
| Stale Listings | `WHERE is_active = false AND has_applied = false` |

**Charts**
- Application Funnel: horizontal bar chart of `interview_stage` counts
- Top 15 Skills: horizontal bar chart of skill frequency across all active jobs
- Jobs Found per Week: area chart of `date_found` over last 12 weeks
- Remote vs On-site: donut chart

**Recent Activity Feed**
- Last 10 jobs added (`date_found DESC`)
- Last 5 status changes (`updated_at DESC` where `interview_stage` changed)

> **US-01** — As a job seeker, I want to see my full pipeline at a glance when I open the app.
> - KPI cards load within 1 second
> - Application funnel reflects real-time `interview_stage` data
> - Top skills chart shows the most demanded skills from saved jobs

---

### 5.2 Jobs List `/jobs`

Filterable, sortable, paginated table of all jobs.

**Table Columns**

| Column | Sortable | Notes |
|--------|----------|-------|
| Company | Yes | |
| Job Title | Yes | Links to `/jobs/[id]` |
| Location / Remote | No | Remote badge if `is_remote = true` |
| Source Platform | No | Icon + name |
| Salary Range | Yes | From `salary_min`/`salary_max`; N/A if null |
| Date Posted | Yes | |
| Status | Yes | `interview_stage` badge |
| Priority | Yes | 1–5 star display |
| Active | No | Warning icon if `is_active = false` |

**Filter Panel**
- Full-text search: company name, job title, job description
- Status: multi-select `interview_stage`
- Platform: multi-select `source_platform`
- Job Type and Experience Level: multi-select
- Remote toggle, Security Clearance toggle
- Salary range: dual slider
- Skills: tag multi-select (AND logic by default, OR toggle)
- Date range: `date_posted` or `date_found`
- Priority: minimum threshold slider

**Bulk Actions**
- Mark selected as applied
- Mark selected as inactive
- Export selected to CSV

> **US-02** — As a job seeker, I want to filter jobs by skill so I can focus on roles where I have the most overlap.
> - Selecting a skill returns only jobs tagged with that skill
> - Multiple skills use AND logic by default with an OR toggle
> - Filter state persists in URL query params for bookmarking

---

### 5.3 Job Detail `/jobs/[id]`

Full view of a single job with description, tags, metadata, and inline editing.

**Layout**
- Left column (60%): full `job_description` with keyword highlighting
- Right sidebar (40%): all metadata fields editable inline; contacts list; notes editor

**Quick Actions**
- Mark Applied: sets `has_applied = true`, `date_applied = today`
- Update Stage: dropdown to change `interview_stage`
- Set Priority: 1–5 star selector
- Add Contact: inline form for recruiter or hiring manager
- Open Original Posting: `job_link` in new tab
- Mark Inactive: sets `is_active = false`

**Tag Display**
- Skills required: blue tags; preferred: outlined blue tags
- Software: purple tags
- Keywords: gray tags
- Certifications: green tags (required) / outlined green (preferred)

> **US-03** — As a job seeker, I want to edit my application notes and interview stage without leaving the detail page.
> - Notes auto-save on blur via `PATCH /api/jobs/[id]`
> - Stage dropdown updates with optimistic UI
> - All edits reflected in the jobs list without a full page reload

---

### 5.4 Add / Edit Job `/jobs/new` | `/jobs/[id]/edit`

Manual job entry form for jobs not captured by the scraper, or to correct scraper output. All schema fields are exposed. Skills, software, keywords, and certifications use tag input with autocomplete from existing values.

---

### 5.5 Analytics `/analytics`

Trend analysis across the full dataset with date-range and platform filters.

| Chart | Description |
|-------|-------------|
| Skill Demand Over Time | Line chart — top 10 skills by month over `date_posted` |
| Salary Distribution | Box-and-whisker by `job_type` and `experience_level` |
| Application Response Rate | % of applied jobs with `heard_back = true`, by platform |
| Platform Breakdown | Pie chart of jobs by `source_platform` |
| Remote vs On-site Trend | Stacked area by week over `date_found` |
| Clearance Salary Premium | Side-by-side avg `salary_max` with/without `security_clearance_req` |
| Top Certifications | Horizontal bar of certification frequency in active jobs |

---

### 5.6 Companies `/companies`

List of all companies with job counts and salary aggregates. Company detail page `/companies/[id]` shows all linked jobs and editable company metadata.

| Column | Notes |
|--------|-------|
| Company Name | Links to `/companies/[id]` |
| Industry & Size | |
| Jobs Found | Count of linked jobs |
| Applied | Count of applied jobs at this company |
| Avg Salary Max | Computed from linked jobs |
| HQ Location | |

---

### 5.7 Settings `/settings`

- **Resume Versions:** manage named resume variants with label, date, and notes
- **Skill Gap Tracker:** enter your own skills; system shows match % per saved job
- **Scraper Webhook Config:** display `POST /api/scrape` URL and API key
- **Export:** full dataset download as CSV or JSON

---

## 6. API Specification

All routes live under `/api/` as Next.js Route Handlers. JSON request and response bodies. `POST`, `PATCH`, and `DELETE` routes require an `Authorization: Bearer <API_KEY>` header.

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/jobs` | List with filter, sort, pagination. Params: `page`, `limit`, `stage`, `platform`, `job_type`, `experience_level`, `is_remote`, `is_active`, `skill_ids`, `salary_min`, `salary_max`, `priority_min`, `q` |
| POST | `/api/jobs` | Create a job (manual entry or scraper payload) |
| GET | `/api/jobs/[id]` | Single job with all relations: skills, software, keywords, certs, contacts |
| PATCH | `/api/jobs/[id]` | Partial update of any job fields |
| DELETE | `/api/jobs/[id]` | Soft delete — sets `is_active = false`, records `deleted_at` |
| GET | `/api/jobs/[id]/description` | Return `job_description` only (keeps list queries fast) |
| GET | `/api/stats` | Dashboard aggregates: stage counts, top skills, weekly job counts, remote % |
| GET | `/api/analytics` | Time-series data for analytics charts |
| GET | `/api/skills` | All skills with usage count |
| GET | `/api/software` | All software with usage count |
| GET | `/api/certifications` | All certifications with usage count |
| GET | `/api/companies` | Companies list with job counts and avg salary |
| GET | `/api/companies/[id]` | Single company with linked jobs |
| PATCH | `/api/companies/[id]` | Update company metadata |
| POST | `/api/scrape` | Scraper webhook — POST new job payloads; handles upsert + dedup. Returns `{ action, job_id }` |
| GET | `/api/export` | Export all jobs as CSV or JSON (`?format=csv\|json`) |

### 6.1 Scraper Payload Schema (`POST /api/scrape`)

| Field | Required | Notes |
|-------|----------|-------|
| `source_platform` | Yes | Platform enum value |
| `external_job_id` | Yes | Used for upsert / dedup |
| `company_name` | Yes | Matched against `companies.name`; new company created if not found |
| `job_title` | Yes | |
| `job_link` | Yes | Canonical URL to posting |
| `job_location` | No | |
| `is_remote` | No | Defaults false |
| `job_description` | No | Full text — API extracts tags if provided |
| `date_posted` | No | ISO date string |
| `salary_text` | No | Raw salary string; API parses to `salary_min`/`salary_max` if recognizable |
| `salary_min` / `salary_max` | No | Override parsed salary |
| `job_type` | No | |
| `experience_level` | No | |
| `security_clearance_req` | No | |
| `skills` | No | Array of skill name strings |
| `software` | No | Array of software name strings |
| `keywords` | No | Array of keyword strings |
| `certifications` | No | Array of certification name strings |

### 6.2 Upsert Logic

1. Lookup by `(external_job_id, source_platform)`. If found: update `last_scraped_at`, `is_active = true`, and any changed fields
2. If not found: fuzzy check by `(company_id, job_title)` within 7 days. If matched: link and skip insert
3. Otherwise: insert new `jobs` row; upsert company; upsert all lookup tags via `INSERT ... ON CONFLICT DO NOTHING`
4. Response: `{ action: 'created' | 'updated' | 'duplicate_skipped', job_id }`

---

## 7. Technical Architecture

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | Next.js 14 (App Router) | SSR for initial load speed; API routes for backend |
| Language | TypeScript | Type safety across DB schema, API, and UI |
| ORM | Drizzle ORM | Type-safe SQL; migrations as code; no magic layer |
| Database | PostgreSQL 16 | Full-text search, strong enum support, JSONB for raw payloads |
| Styling | Tailwind CSS + shadcn/ui | Rapid UI development; accessible, headless components |
| Data Fetching | TanStack Query | Client-side caching, optimistic updates, background refresh |
| Tables | TanStack Table | Headless table with custom cell rendering |
| Charts | Recharts | React-native charts; adequate for analytics requirements |
| Validation | Zod | Shared schema between API route handlers and forms |
| Hosting | Vercel + Railway | Zero-config deploys; Railway managed Postgres |

### 7.1 Directory Structure

```
src/
  app/
    (dashboard)/page.tsx     — Dashboard
    jobs/
      page.tsx               — Jobs list
      [id]/page.tsx          — Job detail
      [id]/edit/page.tsx     — Edit job
      new/page.tsx           — Add job
    analytics/page.tsx       — Analytics
    companies/
      page.tsx               — Companies list
      [id]/page.tsx          — Company detail
    settings/page.tsx        — Settings
    api/                     — Route handlers
  db/
    schema.ts                — Drizzle table definitions + enums
    migrations/              — Auto-generated SQL
  components/                — Shared UI components
  lib/                       — Utilities, API client, query hooks
  types/                     — Shared TypeScript types
```

### 7.2 Data Flow — Scraper to UI

1. Scraper (external Python script) POSTs job payload to `POST /api/scrape` with API key
2. Route handler validates payload with Zod, runs upsert logic, writes to PostgreSQL via Drizzle
3. Next.js pages fetch data via TanStack Query calling `GET /api/*` route handlers
4. Route handlers query PostgreSQL and return typed JSON responses
5. Mutations (`PATCH`, `DELETE`) use optimistic updates + React Query invalidation for instant UI feedback

---

## 8. Out of Scope — MVP

- Built-in web scraper (external Python process; app only consumes its output via `POST /api/scrape`)
- Multi-user authentication
- Email or calendar integrations
- Resume builder or cover letter generator
- Mobile native app
- AI-powered job match scoring (post-MVP)
- Bulk import from LinkedIn or Indeed CSV exports (post-MVP)

---

## 9. Open Questions

| # | Question | Status |
|---|----------|--------|
| Q1 | Store salary as integer cents or decimal? Cents avoids floating-point issues but requires display division. | Open |
| Q2 | Will the scraper run on a cron schedule or on demand? Affects indexing strategy for `last_scraped_at`. | Open |
| Q3 | Should `job_description` have a PostgreSQL `tsvector` GIN index for full-text search? Recommended if description search is a primary filter. | Open |
| Q4 | How should cross-platform duplicates (same job on LinkedIn and Indeed) be surfaced — merged into one row or shown as related? | Open |
| Q5 | Should the skill gap tracker compare against a static user skill list or parse a resume upload? | Open |

---

## Appendix A — Complete Updated jobs Table

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
| `salary_min` | integer (cents) | **NEW** |
| `salary_max` | integer (cents) | **NEW** |
| `salary_text` | text | **NEW** |
| `salary_currency` | char(3) DEFAULT 'USD' | **NEW** |
| `has_applied` | boolean | Existing |
| `date_applied` | date | Existing |
| `heard_back` | boolean | Existing |
| `interview_stage` | interview_stage_enum | Existing |
| `date_posted` | date | Existing |
| `date_found` | date | Existing |
| `last_scraped_at` | timestamptz | **NEW** |
| `is_active` | boolean DEFAULT true | **NEW** |
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

**Recommended indexes:** `(company_id)`, `(interview_stage)`, `(date_found DESC)`, `(is_active)`, `(source_platform)`, `(priority)`, GIN on `to_tsvector('english', job_description)`

---

*End of Document — Job Search Tracker PRD v1.0 — June 2026*
