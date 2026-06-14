# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

This is a **pre-implementation** Next.js application. The full PRD is in `Job_Search_Tracker_PRD.md`. The Dockerfile is ready; the application code does not exist yet.

---

## Commands

```bash
npm run dev          # Start dev server on http://localhost:3000
npm run build        # Production build
npm run start        # Run production build locally
npm run lint         # ESLint
npm run db:generate  # Generate Drizzle migrations from schema changes
npm run db:migrate   # Run pending migrations against PostgreSQL
npm run db:studio    # Open Drizzle Studio (DB browser)
```

These commands don't exist yet — add them to `package.json` when scaffolding.

---

## Architecture

### Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 14 App Router, strict TypeScript |
| ORM | Drizzle ORM |
| Database | PostgreSQL 16 |
| Styling | Tailwind CSS + shadcn/ui |
| Client data | TanStack Query (caching, optimistic updates) |
| Tables | TanStack Table |
| Charts | Recharts |
| Validation | Zod (shared between API handlers and forms) |

### Directory Layout

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
    api/                      — Next.js Route Handlers
  db/
    schema.ts                 — Drizzle table definitions and all ENUMs
    migrations/               — Auto-generated SQL (committed)
  components/                 — Shared UI components
  lib/                        — API client functions, TanStack Query hooks
  types/                      — Shared TypeScript types derived from Drizzle schema
```

### Database Schema (key design decisions)

- **`jobs` table** is the central entity. Salary stored as integer cents (`salary_min`, `salary_max`) alongside a `salary_text` raw display string.
- **`companies` table** normalizes company names to prevent duplicates (`'Google'` vs `'Google LLC'`). `jobs.company_id` FK replaces the old `company_name` text column.
- **Lookup + junction pattern**: `skills`, `software`, `keywords`, `certifications` are lookup tables with junction tables (`job_skills` etc.). `job_skills` and `job_certifications` have an `is_required boolean` to distinguish required vs. preferred.
- **Dedup key**: `UNIQUE(external_job_id, source_platform) WHERE external_job_id IS NOT NULL` on `jobs`. Fuzzy secondary check by `(company_id, job_title)` within 7 days for cross-platform dupes.
- **Soft delete**: `DELETE /api/jobs/[id]` sets `is_active = false` and `deleted_at`, never hard-deletes.

### ENUMs

All defined in `db/schema.ts` and must exist in Postgres before inserts:

- `interview_stage_enum`: `not_applied | applied | phone_screen | technical_screen | onsite | offer_received | rejected | withdrawn`
- `source_platform_enum`: `linkedin | indeed | glassdoor | dice | lever | greenhouse | workday | angellist | direct | other`
- `job_type_enum`: `full_time | part_time | contract | internship | temp | freelance`
- `experience_level_enum`: `entry | mid | senior | lead | executive`
- `company_size_enum`: `1-10 | 11-50 | 51-200 | 201-500 | 501-1000 | 1001-5000 | 5000+`

### API Routes (all under `src/app/api/`)

Protected routes (`POST`, `PATCH`, `DELETE`) require `Authorization: Bearer <API_KEY>`.

Key non-obvious routes:
- `POST /api/scrape` — external Python scraper webhook. Handles upsert+dedup and returns `{ action: 'created' | 'updated' | 'duplicate_skipped', job_id }`.
- `GET /api/jobs/[id]/description` — returns `job_description` only, keeping list queries fast.
- `GET /api/stats` — pre-aggregated dashboard data (stage counts, top skills, weekly counts, remote %).
- `GET /api/export?format=csv|json` — full dataset export.

### Data Flow

External Python scraper → `POST /api/scrape` → Drizzle upsert into PostgreSQL → TanStack Query calls `GET /api/*` → Route handlers return typed JSON → React components with optimistic updates via `PATCH`.

### Zod Validation

Define schemas once and share between:
1. API route handler input validation
2. React Hook Form schemas
3. TypeScript type inference (`z.infer<typeof schema>`)

### Environment Variables

```
DATABASE_URL=postgresql://...
API_KEY=...                   # Bearer token for scraper webhook
```

---

## Deployment

- App → Vercel (zero-config; `NEXT_TELEMETRY_DISABLED=1` set in Dockerfile)
- DB → Railway or Supabase (managed PostgreSQL 16)
- Dockerfile uses a 3-stage build (deps → builder → runner) with a non-root `nextjs` user and `output: 'standalone'` required in `next.config.ts`
