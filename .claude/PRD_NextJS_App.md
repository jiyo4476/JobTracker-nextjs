# Job Search Tracker — Next.js Application PRD

**Version:** 1.0 | **Date:** June 2026 | **Author:** Jimmy Young | **Status:** Draft  
**Related PRDs:** [API PRD](PRD_API.md) · [Python Scraper PRD](PRD_Scraper.md)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Problem Statement](#2-problem-statement)
3. [Goals & Success Metrics](#3-goals--success-metrics)
4. [Technical Architecture](#4-technical-architecture)
5. [Feature Specifications](#5-feature-specifications)
6. [Out of Scope — MVP](#6-out-of-scope--mvp)
7. [Open Questions — Resolved](#7-open-questions--resolved)

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
| Dashboard load time | < 1.5s initial load (cached stats) |
| Application status update | User can update stage in < 3 clicks |
| Skill trend chart render | < 500ms for top-20 skills |
| Stale listing detection | Flagged within 48h of removal |

---

## 4. Technical Architecture

### 4.1 Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | Next.js 14 (App Router) | SSR for initial load speed; API routes for backend |
| Language | TypeScript (strict) | Type safety across DB schema, API, and UI |
| ORM | Drizzle ORM | Type-safe SQL; migrations as code; no magic layer |
| Database | PostgreSQL 16 | Full-text search, strong enum support |
| Styling | Tailwind CSS + shadcn/ui | Rapid UI development; accessible, headless components |
| Data Fetching | TanStack Query | Client-side caching, optimistic updates, background refresh |
| Tables | TanStack Table | Headless table with custom cell rendering |
| Charts | Recharts | React-native charts; adequate for analytics requirements |
| Validation | Zod | Shared schema between API route handlers and forms |
| Hosting | Vercel + Railway | Zero-config deploys; Railway managed Postgres |

### 4.2 Directory Layout

```
src/
  app/
    (dashboard)/page.tsx      — Dashboard KPIs and charts
    jobs/
      page.tsx                — Filterable/sortable jobs list
      [id]/page.tsx           — Job detail with inline editing
      [id]/edit/page.tsx      — Full edit form
      new/page.tsx            — Manual job entry
    analytics/page.tsx        — Trend charts
    companies/
      page.tsx                — Companies list
      [id]/page.tsx           — Company detail
    settings/page.tsx         — Resume versions, skill gap, export
    api/                      — Next.js Route Handlers (see API PRD)
  db/
    schema.ts                 — Drizzle table definitions and all ENUMs
    migrations/               — Auto-generated SQL (committed)
  components/                 — Shared UI components
  lib/                        — API client functions, TanStack Query hooks
  types/                      — Shared TypeScript types derived from Drizzle schema
```

### 4.3 Data Flow

```
Python scraper → POST /api/scrape
  → Drizzle upsert → PostgreSQL
    → TanStack Query → GET /api/*
      → Route handlers → typed JSON
        → React components (optimistic updates via PATCH)
```

### 4.4 Zod Validation Pattern

Define schemas once in `src/lib/` and share between:
1. API route handler input validation
2. React Hook Form schemas
3. TypeScript type inference via `z.infer<typeof schema>`

### 4.5 Environment Variables

```
DATABASE_URL=postgresql://...
AUTHENTIK_ISSUER=https://auth.yjimmy.dev/application/o/job-tracker/
AUTHENTIK_JWKS_URI=https://auth.yjimmy.dev/application/o/job-tracker/jwks/
AUTHENTIK_AUDIENCE=job-tracker
```

### 4.6 Deployment

- **App** → Vercel (zero-config). Set `NEXT_TELEMETRY_DISABLED=1`.
- **DB** → Railway or Supabase (managed PostgreSQL 16).
- Dockerfile: 3-stage build (deps → builder → runner), non-root `nextjs` user.
- `output: 'standalone'` required in `next.config.ts`.

---

## 5. Feature Specifications

The application has 7 pages sharing a persistent left navigation sidebar.  
**Nav items:** Dashboard, Jobs, Analytics, Companies, Settings.

---

### 5.1 Dashboard `/`

Landing page with an at-a-glance view of the entire job search.

**KPI Cards (top row)**

| Card | Query |
|------|-------|
| Total Jobs | `COUNT(*) FROM jobs WHERE is_active = true` |
| Applied | `WHERE has_applied = true` |
| Active Interviews | `WHERE interview_stage IN ('phone_screen', 'technical_screen', 'onsite')` |
| Stale Listings | `WHERE is_active = false AND has_applied = false` |

**Charts**

| Chart | Type | Data Source |
|-------|------|-------------|
| Application Funnel | Horizontal bar | `interview_stage` counts from `/api/stats` |
| Top 15 Skills | Horizontal bar | Skill frequency across active jobs from `/api/stats` |
| Jobs Found per Week | Area chart | `date_found` counts over last 12 weeks from `/api/stats` |
| Remote vs On-site | Donut | Remote % from `/api/stats` |

**Recent Activity Feed**
- Last 10 jobs added (`date_found DESC`)
- Last 5 status changes — sourced from `job_status_history` table (`changed_at DESC`)

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
| Salary Range | Yes | Formatted from `salary_min`/`salary_max`; N/A if null |
| Date Posted | Yes | |
| Status | Yes | `interview_stage` badge |
| Priority | Yes | 1–5 star display |
| Active | No | Warning icon if `is_active = false` |

**Filter Panel**

- Full-text search: company name, job title, job description (GIN index)
- Status: multi-select `interview_stage`
- Platform: multi-select `source_platform`
- Job Type and Experience Level: multi-select
- Remote toggle, Security Clearance toggle
- Salary range: unified dual slider in annual terms. Hourly jobs filter against `annual_equivalent_min`/`annual_equivalent_max` (hourly × 2080). A "Salary Type" toggle (All / Annual / Hourly) restricts to one type.
- Skills: tag multi-select (AND logic by default, OR toggle)
- Date range: `date_posted` or `date_found`
- Priority: minimum threshold slider

**Filter State:** persists in URL query params for bookmarking and sharing.

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

| Action | Effect |
|--------|--------|
| Mark Applied | Sets `has_applied = true`, `date_applied = today` via `PATCH /api/jobs/[id]` |
| Update Stage | Dropdown to change `interview_stage`; optimistic UI update |
| Set Priority | 1–5 star selector |
| Add Contact | Inline form for recruiter or hiring manager |
| Open Original Posting | Opens `job_link` in new tab |
| Mark Inactive | Sets `is_active = false` |

**Tag Display**

| Tag Type | Style |
|----------|-------|
| Skills (required) | Solid blue |
| Skills (preferred) | Outlined blue |
| Software | Solid purple |
| Keywords | Solid gray |
| Certifications (required) | Solid green |
| Certifications (preferred) | Outlined green |

> **US-03** — As a job seeker, I want to edit my application notes and interview stage without leaving the detail page.
> - Notes auto-save on blur via `PATCH /api/jobs/[id]`
> - Stage dropdown updates with optimistic UI
> - All edits reflected in the jobs list without a full page reload

---

### 5.4 Add / Edit Job `/jobs/new` | `/jobs/[id]/edit`

Manual job entry form for jobs not captured by the scraper, or to correct scraper output.

- All schema fields are exposed in the form
- Skills, software, keywords, and certifications use tag inputs with autocomplete from existing values in the database
- Saves via `POST /api/jobs` (new) or `PATCH /api/jobs/[id]` (edit)

---

### 5.5 Analytics `/analytics`

Trend analysis across the full dataset with date-range and platform filters applied globally.

| Chart | Type | Description |
|-------|------|-------------|
| Skill Demand Over Time | Line | Top 10 skills by month over `date_posted` |
| Salary Distribution | Box-and-whisker | By `job_type` and `experience_level`. Uses `annual_equivalent_min`/`annual_equivalent_max` for all jobs (hourly × 2080). Y-axis in $k/yr. |
| Application Response Rate | Bar | % of applied jobs with `heard_back = true`, by platform |
| Platform Breakdown | Pie | Jobs by `source_platform` |
| Remote vs On-site Trend | Stacked area | By week over `date_found` |
| Clearance Salary Premium | Side-by-side bar | Avg `salary_max` with vs. without `security_clearance_req` |
| Top Certifications | Horizontal bar | Certification frequency in active jobs |

All charts powered by Recharts. Data fetched from `GET /api/analytics` with date-range and platform params.

---

### 5.6 Companies `/companies` and `/companies/[id]`

**List page** — all companies with job counts and salary aggregates:

| Column | Notes |
|--------|-------|
| Company Name | Links to `/companies/[id]` |
| Industry & Size | |
| Jobs Found | Count of linked jobs |
| Applied | Count of applied jobs at this company |
| Avg Salary Max | Computed from linked jobs |
| HQ Location | |

**Detail page `/companies/[id]`** — editable company metadata + all linked jobs as a sub-table. Edits save via `PATCH /api/companies/[id]`.

---

### 5.7 Settings `/settings`

**Resume Versions**
- Labels-only table: name, date, notes. No file upload.
- `resume_version` on a job stores the label string as a reference.
- Backed by `resume_versions` table (`id`, `label`, `date`, `notes`).

**Skill Gap Tracker**
- Displays every skill/technology extracted from saved job listings.
- Each row: skill name, job count requiring it, user toggle "I have this skill."
- User's skill list stored in `user_skills` (`skill_id` FK, `has_skill boolean`).
- Match % per job = `(required skills user has) / (total required skills) × 100`.

**Scraper Webhook Config**
- Display-only: `POST /api/scrape` endpoint URL and Authentik OAuth2 machine-client requirements.

**Export**
- Full dataset download via `GET /api/export?format=csv` or `?format=json`.

---

## 6. Out of Scope — MVP

- Multi-user authentication
- Email or calendar integrations
- Resume builder or cover letter generator
- Mobile native app
- AI-powered job match scoring
- Bulk import from LinkedIn or Indeed CSV exports

---

## 7. Open Questions — Resolved

| # | Question | Resolution |
|---|----------|------------|
| Q1 | Salary as cents or decimal? | Annual salaries as integer cents; hourly as `numeric(10,2)`. Hourly normalized to annual equivalent cents (`× 2080 × 100`) in `annual_equivalent_min`/`annual_equivalent_max` for unified filtering. |
| Q3 | GIN index on `job_description`? | Yes — `CREATE INDEX jobs_description_search_idx ON jobs USING GIN (to_tsvector('english', coalesce(job_description, '')));` via raw SQL after `db:generate`. |
| Q5 | Skill gap tracker — static list or resume upload? | Static user list. All skills from job listings shown in Settings; user toggles which they have. Stored in `user_skills` table. Match % = required skills user has ÷ total required skills per job. |
