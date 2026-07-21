@AGENTS.md

# CLAUDE.md — Next.js App & API

This file provides guidance for the Next.js application and its API route handlers.  
For the Python scraper, see [`scraper/.claude/CLAUDE.md`](../scraper/.claude/CLAUDE.md).

---

## Obsidian Vault Location

This repository is one of three sibling projects inside the shared `job_tracker` workspace. The Obsidian vault is the workspace root—the directory containing `.obsidian/`, `chrome-ext-scrapper/`, `job-tracker-nextjs/`, and `job_scraper_python/`. From this repository, project notes, task boards, provider documentation, and handoffs are at `../.obsidian/`. Because the workspace's absolute path varies by contributor and operating system, locate it by resolving this repository's parent directory. Read and update that shared vault rather than creating a repository-local vault.

---

## Project Status

**Pre-implementation.** The full PRD is in `.claude/Job_Search_Tracker_PRD.md`. The Dockerfile is ready; application code does not exist yet.

---

## Commands

```bash
npm run dev          # Dev server → http://localhost:3000
npm run build        # Production build
npm run start        # Run production build locally
npm run lint         # ESLint
npm run db:generate  # Generate Drizzle migrations from schema changes
npm run db:migrate   # Run pending migrations against PostgreSQL
npm run db:studio    # Open Drizzle Studio (DB browser)
```

Add these to `package.json` when scaffolding.

---

## Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 14 App Router, strict TypeScript |
| ORM | Drizzle ORM |
| Database | PostgreSQL 16 |
| Styling | Tailwind CSS + shadcn/ui |
| Client data | TanStack Query (caching, optimistic updates) |
| Tables | TanStack Table |
| Charts | Recharts |
| Validation | Zod (shared between route handlers and forms) |

---

## Directory Layout

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
    api/                      — Next.js Route Handlers (see below)
  db/
    schema.ts                 — Drizzle table definitions and all ENUMs
    migrations/               — Auto-generated SQL (committed)
  components/                 — Shared UI components
  lib/                        — API client functions, TanStack Query hooks
  types/                      — Shared TypeScript types derived from Drizzle schema
```

---

## API Routes (`src/app/api/`)

External `POST`, `PATCH`, and `DELETE` callers require `Authorization: Bearer <OAuth2 access token>` issued by Authentik at `https://auth.yjimmy.dev`. Same-origin browser calls are allowed without an Authorization header because Authentik protects the web app in front of Next.js. `API_KEY` is only a deprecated local fallback while migrating old callers.

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/jobs` | List with filter/sort/pagination. Params: `page`, `limit`, `stage`, `platform`, `job_type`, `experience_level`, `is_remote`, `is_active`, `skill_ids`, `salary_min`, `salary_max`, `priority_min`, `q` |
| POST | `/api/jobs` | Create job (manual entry) |
| GET | `/api/jobs/[id]` | Single job with skills, software, keywords, certs, contacts |
| PATCH | `/api/jobs/[id]` | Partial update of any job fields |
| DELETE | `/api/jobs/[id]` | Soft delete → sets `is_active = false`, `deleted_at` |
| GET | `/api/jobs/[id]/description` | Return `job_description` only (keeps list queries fast) |
| GET | `/api/stats` | Dashboard aggregates: stage counts, top skills, weekly counts, remote % |
| GET | `/api/analytics` | Time-series data for analytics charts |
| GET | `/api/skills` | All skills with usage count |
| GET | `/api/software` | All software with usage count |
| GET | `/api/certifications` | All certifications with usage count |
| GET | `/api/companies` | Companies list with job counts and avg salary |
| GET | `/api/companies/[id]` | Single company with linked jobs |
| PATCH | `/api/companies/[id]` | Update company metadata |
| POST | `/api/scrape` | Scraper webhook — upsert + dedup; returns `{ action, job_id }` |
| GET | `/api/export` | Full dataset download (`?format=csv\|json`) |

### Scraper Webhook: `POST /api/scrape`

The Python scraper calls this endpoint. The handler must:

1. Lookup by `(external_job_id, source_platform)` → update if found
2. Fuzzy check by `(company_id, job_title)` within 7 days → link and skip if matched
3. Otherwise insert; upsert company; upsert lookup tags via `INSERT ... ON CONFLICT DO NOTHING`
4. If `skills`/`software`/`keywords`/`certifications` arrays are empty but `job_description` is present, run server-side NLP tag extraction
5. Return `{ action: 'created' | 'updated' | 'duplicate_skipped', job_id }`

---

## Database Schema

### ENUMs (define in `db/schema.ts` before any inserts)

| Enum | Values |
|------|--------|
| `interview_stage_enum` | `not_applied \| applied \| phone_screen \| technical_screen \| onsite \| offer_received \| rejected \| withdrawn` |
| `source_platform_enum` | `linkedin \| indeed \| glassdoor \| dice \| lever \| greenhouse \| workday \| angellist \| direct \| other` |
| `job_type_enum` | `full_time \| part_time \| contract \| internship \| temp \| freelance` |
| `experience_level_enum` | `entry \| mid \| senior \| lead \| executive` |
| `company_size_enum` | `1-10 \| 11-50 \| 51-200 \| 201-500 \| 501-1000 \| 1001-5000 \| 5000+` |
| `salary_type_enum` | `annual \| hourly` |

### Key Design Decisions

- **`jobs`** is the central entity. Salary stored as integer cents (`salary_min`, `salary_max`) for annual; `hourly_rate_min`/`hourly_rate_max` as `numeric(10,2)`. `annual_equivalent_min`/`annual_equivalent_max` are computed on ingest (`hourly × 2080 × 100`) for unified salary filtering. `salary_text` stores the raw display string.
- **`companies`** normalizes company names. `jobs.company_id` FK replaces free-text `company_name`. Old `company_name` column kept nullable during migration, then dropped after backfill.
- **Lookup + junction pattern**: `skills`, `software`, `keywords`, `certifications` are lookup tables. Junction tables (`job_skills`, `job_software`, etc.) have a composite PK. `job_skills` and `job_certifications` add `is_required boolean` to distinguish required vs. preferred.
- **Dedup key**: `UNIQUE(external_job_id, source_platform) WHERE external_job_id IS NOT NULL` on `jobs`.
- **Soft delete**: `DELETE /api/jobs/[id]` sets `is_active = false` and `deleted_at` — never hard-deletes.
- **`job_description`** has a GIN tsvector index for full-text search.

### Additional Tables

- **`contacts`**: `(id, job_id FK, name, email, phone, role, contacted_at, notes)` — recruiters/hiring managers per job
- **`resume_versions`**: `(id, label, date, notes)` — resume variant labels referenced from `jobs.resume_version`
- **`user_skills`**: user's personal skill list for the skill gap tracker in Settings
- **`job_status_history`**: records stage changes for the Recent Activity feed

---

## Zod Validation

Define schemas once in `src/lib/` and share between:
1. API route handler input validation
2. React Hook Form schemas
3. TypeScript type inference via `z.infer<typeof schema>`

---

## Data Flow

```
Python scraper → POST /api/scrape
  → Drizzle upsert into PostgreSQL
    → TanStack Query → GET /api/*
      → Route handlers return typed JSON
        → React components with optimistic updates via PATCH
```

---

## Environment Variables

```
DATABASE_URL=postgresql://...
API_KEY=...        # Deprecated local bearer-token fallback only
AUTHENTIK_BASE_URL=https://auth.yjimmy.dev
AUTHENTIK_APP_SLUG=job-tracker
AUTHENTIK_ISSUER=https://auth.yjimmy.dev/application/o/job-tracker/
AUTHENTIK_JWKS_URI=https://auth.yjimmy.dev/application/o/job-tracker/jwks/
AUTHENTIK_AUDIENCE=job-tracker
AUTHENTIK_TRUSTED_ISSUERS="https://auth.yjimmy.dev/application/o/job-tracker-scraper/ https://auth.yjimmy.dev/application/o/job-tracker-extension/ https://auth.yjimmy.dev/application/o/job-tracker-scraper/"
AUTHENTIK_AUDIENCES="job-tracker-scraper job-tracker-extension"
AUTHENTIK_FORWARD_AUTH_ENABLED=  # "true" only behind Authentik's forward-auth outpost (see src/lib/auth.ts)
```

---

## Deployment

- **App** → Vercel (zero-config). Set `NEXT_TELEMETRY_DISABLED=1`.
- **DB** → Railway or Supabase (managed PostgreSQL 16).
- Dockerfile: 3-stage build (deps → builder → runner), non-root `nextjs` user, `output: 'standalone'` required in `next.config.ts`.

---

## Pages (7 total, shared left nav sidebar)

| Route | Page | Key Notes |
|-------|------|-----------|
| `/` | Dashboard | KPI cards, funnel chart, top-15 skills, weekly area chart, remote donut, recent activity feed |
| `/jobs` | Jobs List | TanStack Table; filter panel; URL-persisted filter state; bulk actions |
| `/jobs/[id]` | Job Detail | Inline editing; notes auto-save on blur; optimistic stage updates |
| `/jobs/new` \| `/jobs/[id]/edit` | Add/Edit Job | Full form; tag inputs with autocomplete |
| `/analytics` | Analytics | Skill demand over time, salary box-and-whisker, response rate, platform breakdown |
| `/companies` | Companies | List with job counts and salary aggregates |
| `/settings` | Settings | Resume versions, skill gap tracker, scraper config display, CSV/JSON export |
