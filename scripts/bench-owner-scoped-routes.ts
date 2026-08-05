/**
 * API-013 — latency budget harness for the owner-scoped route cutover.
 *
 * Seeds a documented production-like dataset into a DEDICATED throwaway database,
 * then drives the REAL Next.js route handlers (no HTTP server, no mocks below the
 * auth boundary) and reports p50/p95/p99 per operation, plus
 * `EXPLAIN (ANALYZE, BUFFERS)` for the list and detail queries so the owner-first
 * composite indexes on `user_job_state` can be confirmed in the plan.
 *
 * Acceptance budget (API-013): list/detail p95 <= 300 ms, mutations p95 <= 500 ms.
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *   BENCH_DATABASE_URL=postgresql://user:pw@localhost:5432/job_tracker_bench \
 *     npm run bench:routes -- --out docs/latency-benchmark.results.md
 *
 * Flags:
 *   --out <path>     also write the markdown report to <path> (default: stdout only)
 *   --no-seed        skip seeding (re-use an already-seeded bench database)
 *   --samples <n>    measured samples per read op (default 200; mutations use n/2)
 *   --warmup <n>     discarded warmup iterations per op (default 25)
 *
 * ── Safety ───────────────────────────────────────────────────────────────────
 * This script TRUNCATES and rewrites data. It refuses to run unless ALL hold:
 *   1. `BENCH_DATABASE_URL` is set explicitly (it never falls back to DATABASE_URL).
 *   2. Its database name matches /bench/i — a deliberate opt-in naming convention.
 *   3. It differs from `DATABASE_URL`, so the app database can never be the target.
 *   4. `NODE_ENV !== 'production'`.
 * Create the target with `CREATE DATABASE job_tracker_bench;` and migrate it with
 * `DATABASE_URL=$BENCH_DATABASE_URL npx drizzle-kit migrate` before the first run.
 * No credentials are read from, or written to, the repository.
 */

import { writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'

// ── Guard rails ──────────────────────────────────────────────────────────────

function fail(message: string): never {
  console.error(`bench: ${message}`)
  process.exit(1)
}

const benchUrl = process.env.BENCH_DATABASE_URL
if (!benchUrl) {
  fail(
    'BENCH_DATABASE_URL is not set. This harness seeds and truncates data, so it ' +
      'never falls back to DATABASE_URL. Point it at a dedicated database whose ' +
      'name contains "bench".',
  )
}
if (process.env.NODE_ENV === 'production') {
  fail('refusing to run with NODE_ENV=production.')
}
if (process.env.DATABASE_URL && process.env.DATABASE_URL === benchUrl) {
  fail('BENCH_DATABASE_URL must differ from DATABASE_URL (never bench the app database).')
}

let benchDatabaseName: string
try {
  benchDatabaseName = new URL(benchUrl).pathname.replace(/^\//, '')
} catch {
  fail('BENCH_DATABASE_URL is not a valid connection URL.')
}
if (!/bench/i.test(benchDatabaseName)) {
  fail(
    `refusing to seed database "${benchDatabaseName}": the bench database name must ` +
      'contain "bench" so a real database can never be targeted by accident.',
  )
}

// The route handlers and `@/db` read DATABASE_URL lazily on first use, so pointing it
// at the bench URL here — BEFORE any dynamic import below — is what redirects every
// query. Every import in this file that touches the DB is therefore deferred.
process.env.DATABASE_URL = benchUrl

// Local-only same-origin dev identity: lets the real `resolveRequestUser` composition
// run end-to-end (including the users upsert) without minting OAuth tokens. Guarded by
// the NODE_ENV check in src/lib/auth.ts.
process.env.AUTH_DEV_ALLOW_SAME_ORIGIN = 'true'
process.env.AUTH_DEV_ISSUER = 'http://bench-harness/'

// Per-request info logging would dominate the measurement and pollute the report on
// stdout. Callers can override to debug the harness itself.
process.env.LOG_LEVEL ??= 'error'

// ── CLI ──────────────────────────────────────────────────────────────────────

function flagValue(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const OUT_PATH = flagValue('out')
const SKIP_SEED = process.argv.includes('--no-seed')
const SAMPLES = Number(flagValue('samples') ?? 200)
const WARMUP = Number(flagValue('warmup') ?? 25)

// ── Documented production-like dataset ───────────────────────────────────────
// Sized so the owner predicate has to be selective: the catalog is an order of
// magnitude larger than any one user's tracker, and three users share it.

const DATASET = {
  users: 3,
  companies: 400,
  jobs: 5_000,
  /** user_job_state rows per user, index-aligned with USER_SUBJECTS. */
  statePerUser: [1_200, 800, 200],
  /** Of user 1's rows, how many are hidden (so `tracked` and `hidden` both filter). */
  hiddenForUser1: 200,
  /** job_skills links per job. */
  skillsPerJob: 3,
  /** user_job_contacts rows for user 1. */
  contactsForUser1: 500,
  /** user_job_status_history rows for user 1. */
  historyForUser1: 2_000,
} as const

const USER_SUBJECTS = ['bench-user-1', 'bench-user-2', 'bench-user-3']

// ── Stats ────────────────────────────────────────────────────────────────────

type Percentiles = { n: number; p50: number; p95: number; p99: number; min: number; max: number }

function percentiles(samples: number[]): Percentiles {
  const sorted = [...samples].sort((a, b) => a - b)
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]
  return {
    n: sorted.length,
    p50: at(50),
    p95: at(95),
    p99: at(99),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  }
}

type Measurement = {
  op: string
  budgetMs: number
  stats: Percentiles
}

async function measure(
  op: string,
  budgetMs: number,
  samples: number,
  run: (i: number) => Promise<{ status: number }>,
): Promise<Measurement> {
  for (let i = 0; i < WARMUP; i++) {
    const res = await run(i)
    if (res.status >= 400) throw new Error(`${op}: warmup returned ${res.status}`)
  }
  const timings: number[] = []
  for (let i = 0; i < samples; i++) {
    const started = performance.now()
    const res = await run(i)
    timings.push(performance.now() - started)
    if (res.status >= 400) throw new Error(`${op}: sample ${i} returned ${res.status}`)
  }
  return { op, budgetMs, stats: percentiles(timings) }
}

// ── Request construction ─────────────────────────────────────────────────────

type NextRequestCtor = typeof import('next/server').NextRequest

function makeRequest(
  NextRequest: NextRequestCtor,
  path: string,
  init?: { method?: string; body?: unknown },
) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
      'content-type': 'application/json',
    },
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  })
}

function params(id: number) {
  return { params: Promise.resolve({ id: String(id) }) }
}

// ── Seeding ──────────────────────────────────────────────────────────────────

const STAGES = [
  'not_applied', 'applied', 'phone_screen', 'technical_screen',
  'onsite', 'offer_received', 'rejected', 'withdrawn',
] as const

async function seed() {
  const { db } = await import('@/db')
  const { sql } = await import('drizzle-orm')

  console.error(`bench: seeding ${benchDatabaseName} …`)

  // Order matters: children first. RESTART IDENTITY keeps ids deterministic per run.
  await db.execute(sql`
    TRUNCATE TABLE user_job_status_history, user_job_contacts, user_job_state,
      job_skills, job_software, job_keywords, job_certifications,
      jobs, companies, users
    RESTART IDENTITY CASCADE
  `)

  await db.execute(sql`
    INSERT INTO users (issuer, subject, display_name)
    SELECT 'http://bench-harness/', 'bench-user-' || g, 'Bench User ' || g
    FROM generate_series(1, ${DATASET.users}) g
  `)

  await db.execute(sql`
    INSERT INTO companies (name, industry, hq_location)
    SELECT 'Bench Company ' || g, 'Software', 'Denver, CO'
    FROM generate_series(1, ${DATASET.companies}) g
  `)

  // A catalog spread across companies, platforms, salary bands and dates, so the list
  // filters and sorts have real selectivity to work with.
  await db.execute(sql`
    INSERT INTO jobs (
      company_id, job_title, job_link, job_location, is_remote, source_platform,
      external_job_id, job_type, experience_level, job_description,
      salary_type, salary_min, salary_max, annual_equivalent_min, annual_equivalent_max,
      date_posted, date_found, is_active, security_clearance_req
    )
    SELECT
      1 + (g % ${DATASET.companies}),
      'Bench Engineer ' || g,
      'https://example.invalid/jobs/' || g,
      'Denver, CO',
      (g % 3 = 0),
      (ARRAY['linkedin','indeed','glassdoor','dice','lever']::source_platform_enum[])[1 + (g % 5)],
      'bench-' || g,
      'full_time'::job_type_enum,
      (ARRAY['entry','mid','senior','lead']::experience_level_enum[])[1 + (g % 4)],
      'Bench posting ' || g || '. Requires distributed systems, PostgreSQL and TypeScript experience.',
      'annual'::salary_type_enum,
      8000000 + (g % 50) * 100000,
      12000000 + (g % 50) * 100000,
      8000000 + (g % 50) * 100000,
      12000000 + (g % 50) * 100000,
      CURRENT_DATE - ((g % 120) || ' days')::interval,
      CURRENT_DATE - ((g % 90) || ' days')::interval,
      TRUE,
      (g % 7 = 0)
    FROM generate_series(1, ${DATASET.jobs}) g
  `)

  // Taxonomy links against the skills seeded by migration 0001.
  await db.execute(sql`
    INSERT INTO job_skills (job_id, skill_id, is_required)
    SELECT j.id, s.id, (j.id % 2 = 0)
    FROM jobs j
    CROSS JOIN LATERAL (
      SELECT id FROM skills ORDER BY (id + j.id) % 97 LIMIT ${DATASET.skillsPerJob}
    ) s
    ON CONFLICT DO NOTHING
  `)

  // Each user tracks a different, overlapping slice of the same catalog.
  for (let u = 0; u < DATASET.users; u++) {
    const userId = u + 1
    const rows = DATASET.statePerUser[u]
    await db.execute(sql`
      INSERT INTO user_job_state (
        user_id, job_id, priority, is_hidden, has_applied, date_applied,
        heard_back, interview_stage, notes
      )
      SELECT
        ${userId},
        j.id,
        1 + (j.id % 5),
        ${u === 0 ? sql`(j.id % ${Math.floor(DATASET.statePerUser[0] / DATASET.hiddenForUser1)} = 0)` : sql`FALSE`},
        (j.id % 3 = 0),
        CASE WHEN j.id % 3 = 0 THEN CURRENT_DATE - ((j.id % 60) || ' days')::interval ELSE NULL END,
        (j.id % 5 = 0),
        (ARRAY['not_applied','applied','phone_screen','technical_screen','onsite','offer_received','rejected','withdrawn']::interview_stage_enum[])[1 + (j.id % 8)],
        'Bench notes for job ' || j.id
      FROM jobs j
      WHERE j.id % ${DATASET.users} = ${u}
      ORDER BY j.id
      LIMIT ${rows}
      ON CONFLICT DO NOTHING
    `)
  }

  await db.execute(sql`
    INSERT INTO user_job_contacts (user_id, job_id, name, email, phone, role)
    SELECT 1, s.job_id, 'Bench Recruiter ' || s.job_id,
           'recruiter' || s.job_id || '@example.invalid', '555-0100', 'recruiter'
    FROM (SELECT job_id FROM user_job_state WHERE user_id = 1 ORDER BY job_id LIMIT ${DATASET.contactsForUser1}) s
  `)

  await db.execute(sql`
    INSERT INTO user_job_status_history (user_id, job_id, from_stage, to_stage, changed_at)
    SELECT 1, s.job_id, 'not_applied'::interview_stage_enum, 'applied'::interview_stage_enum,
           now() - ((s.rn % 90) || ' days')::interval
    FROM (
      SELECT job_id, row_number() OVER (ORDER BY job_id) AS rn
      FROM user_job_state WHERE user_id = 1
    ) s
    CROSS JOIN generate_series(1, 2) g
    LIMIT ${DATASET.historyForUser1}
  `)

  await db.execute(sql`ANALYZE`)

  const [counts] = await db.execute<Record<string, string>>(sql`
    SELECT
      (SELECT count(*) FROM users) AS users,
      (SELECT count(*) FROM companies) AS companies,
      (SELECT count(*) FROM jobs) AS jobs,
      (SELECT count(*) FROM user_job_state) AS user_job_state,
      (SELECT count(*) FROM user_job_state WHERE is_hidden) AS hidden_state,
      (SELECT count(*) FROM job_skills) AS job_skills,
      (SELECT count(*) FROM user_job_contacts) AS contacts,
      (SELECT count(*) FROM user_job_status_history) AS history
  `)
  return counts
}

// ── EXPLAIN capture ──────────────────────────────────────────────────────────

async function explain(label: string, query: ReturnType<typeof import('drizzle-orm').sql>) {
  const { db } = await import('@/db')
  const { sql } = await import('drizzle-orm')
  const rows = await db.execute<{ 'QUERY PLAN': string }>(
    sql`EXPLAIN (ANALYZE, BUFFERS) ${query}`,
  )
  const plan = (rows as unknown as Array<Record<string, string>>)
    .map((r) => r['QUERY PLAN'])
    .join('\n')
  return { label, plan }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  let seedCounts: Record<string, string> | undefined
  if (!SKIP_SEED) seedCounts = await seed()

  const { NextRequest } = await import('next/server')
  const { sql } = await import('drizzle-orm')

  // Drive as bench user 1 — the user with the largest tracker, i.e. the worst case.
  process.env.AUTH_DEV_SUBJECT = USER_SUBJECTS[0]

  const jobsRoute = await import('@/app/api/jobs/route')
  const jobDetailRoute = await import('@/app/api/jobs/[id]/route')
  const stateRoute = await import('@/app/api/jobs/[id]/state/route')
  const contactsRoute = await import('@/app/api/jobs/[id]/contacts/route')
  const contactRoute = await import('@/app/api/jobs/[id]/contacts/[contactId]/route')

  // The job ids user 1 actually tracks — so detail/mutation samples hit real state
  // rather than the untracked-catalog fast path.
  const { db } = await import('@/db')
  const trackedRows = await db.execute<{ job_id: number }>(
    sql`SELECT job_id FROM user_job_state WHERE user_id = 1 AND is_hidden = FALSE ORDER BY job_id LIMIT 500`,
  )
  const trackedIds = (trackedRows as unknown as Array<{ job_id: number }>).map((r) => Number(r.job_id))
  if (trackedIds.length === 0) fail('bench database has no tracked rows — seed it first.')

  const measurements: Measurement[] = []
  const mutationSamples = Math.max(20, Math.floor(SAMPLES / 2))

  measurements.push(
    await measure('GET /api/jobs?scope=tracked', 300, SAMPLES, () =>
      jobsRoute.GET(makeRequest(NextRequest, '/api/jobs?scope=tracked&page=1&limit=25')),
    ),
  )
  measurements.push(
    await measure('GET /api/jobs?scope=catalog', 300, SAMPLES, () =>
      jobsRoute.GET(makeRequest(NextRequest, '/api/jobs?scope=catalog&page=1&limit=25')),
    ),
  )
  measurements.push(
    await measure('GET /api/jobs?scope=hidden', 300, SAMPLES, () =>
      jobsRoute.GET(makeRequest(NextRequest, '/api/jobs?scope=hidden&page=1&limit=25')),
    ),
  )
  measurements.push(
    await measure('GET /api/jobs?scope=tracked&stage=applied&sort_by=priority', 300, SAMPLES, () =>
      jobsRoute.GET(
        makeRequest(NextRequest, '/api/jobs?scope=tracked&stage=applied&sort_by=priority&sort_order=desc'),
      ),
    ),
  )
  measurements.push(
    await measure('GET /api/jobs/[id]', 300, SAMPLES, (i) => {
      const id = trackedIds[i % trackedIds.length]
      return jobDetailRoute.GET(makeRequest(NextRequest, `/api/jobs/${id}`), params(id))
    }),
  )
  measurements.push(
    await measure('PATCH /api/jobs/[id]/state', 500, mutationSamples, (i) => {
      const id = trackedIds[i % trackedIds.length]
      return stateRoute.PATCH(
        makeRequest(NextRequest, `/api/jobs/${id}/state`, {
          method: 'PATCH',
          body: { priority: 1 + (i % 5), notes: `bench ${i}` },
        }),
        params(id),
      )
    }),
  )
  measurements.push(
    await measure('PATCH /api/jobs/[id]/state (stage change → history row)', 500, mutationSamples, (i) => {
      const id = trackedIds[i % trackedIds.length]
      return stateRoute.PATCH(
        makeRequest(NextRequest, `/api/jobs/${id}/state`, {
          method: 'PATCH',
          body: { interview_stage: STAGES[i % STAGES.length] },
        }),
        params(id),
      )
    }),
  )
  measurements.push(
    await measure('GET /api/jobs/[id]/contacts', 300, SAMPLES, (i) => {
      const id = trackedIds[i % trackedIds.length]
      return contactsRoute.GET(makeRequest(NextRequest, `/api/jobs/${id}/contacts`), params(id))
    }),
  )

  // Contact create/update/delete measured as a matched triple so the bench database
  // does not grow without bound across samples.
  // (jobId, contactId) pairs must travel together: the update/delete predicates pin
  // BOTH ids plus the owner, so a mismatched pair is a (correct) non-disclosing 404.
  const createdContacts: Array<{ jobId: number; contactId: number }> = []
  measurements.push(
    await measure('POST /api/jobs/[id]/contacts', 500, mutationSamples, async (i) => {
      const id = trackedIds[i % trackedIds.length]
      const res = await contactsRoute.POST(
        makeRequest(NextRequest, `/api/jobs/${id}/contacts`, {
          method: 'POST',
          body: { name: `Bench Contact ${i}`, email: `bench${i}@example.invalid`, role: 'recruiter' },
        }),
        params(id),
      )
      if (res.status < 400) {
        createdContacts.push({ jobId: id, contactId: (await res.clone().json()).id })
      }
      return res
    }),
  )
  measurements.push(
    await measure('PATCH /api/jobs/[id]/contacts/[contactId]', 500, mutationSamples, (i) => {
      const { jobId, contactId } = createdContacts[i % createdContacts.length]
      return contactRoute.PATCH(
        makeRequest(NextRequest, `/api/jobs/${jobId}/contacts/${contactId}`, {
          method: 'PATCH',
          body: { notes: `bench update ${i}` },
        }),
        { params: Promise.resolve({ id: String(jobId), contactId: String(contactId) }) },
      )
    }),
  )
  // DELETE consumes the pairs created above, so the bench database does not grow
  // without bound across runs.
  let deleteCursor = 0
  measurements.push(
    await measure(
      'DELETE /api/jobs/[id]/contacts/[contactId]',
      500,
      Math.min(mutationSamples, Math.max(1, createdContacts.length - WARMUP)),
      () => {
        const { jobId, contactId } = createdContacts[deleteCursor++ % createdContacts.length]
        return contactRoute.DELETE(
          makeRequest(NextRequest, `/api/jobs/${jobId}/contacts/${contactId}`, { method: 'DELETE' }),
          { params: Promise.resolve({ id: String(jobId), contactId: String(contactId) }) },
        )
      },
    ),
  )

  const plans = [
    await explain(
      'GET /api/jobs?scope=tracked — owner inner join + count',
      sql`
        SELECT j.id, s.priority, s.interview_stage
        FROM jobs j
        LEFT JOIN companies c ON j.company_id = c.id
        INNER JOIN user_job_state s ON s.job_id = j.id AND s.user_id = 1
        WHERE s.is_hidden = FALSE AND j.is_active = TRUE AND j.deleted_at IS NULL
        ORDER BY j.date_found DESC NULLS LAST, j.id DESC
        LIMIT 25
      `,
    ),
    await explain(
      'GET /api/jobs?scope=tracked&stage=applied — user_job_state_user_stage_idx',
      sql`
        SELECT j.id
        FROM jobs j
        INNER JOIN user_job_state s ON s.job_id = j.id AND s.user_id = 1
        WHERE s.interview_stage = 'applied' AND s.is_hidden = FALSE
          AND j.is_active = TRUE AND j.deleted_at IS NULL
        ORDER BY s.priority DESC NULLS LAST, j.id DESC
        LIMIT 25
      `,
    ),
    await explain(
      'GET /api/jobs/[id] — owner state lookup on the composite PK',
      sql`
        SELECT priority, interview_stage, notes
        FROM user_job_state
        WHERE user_id = 1 AND job_id = ${trackedIds[0]}
        LIMIT 1
      `,
    ),
    await explain(
      'GET /api/jobs/[id] — owner contacts lookup',
      sql`
        SELECT id, name, email
        FROM user_job_contacts
        WHERE user_id = 1 AND job_id = ${trackedIds[0]}
        ORDER BY created_at ASC
      `,
    ),
  ]

  const report = renderReport(measurements, plans, seedCounts)
  process.stdout.write(report)
  if (OUT_PATH) {
    writeFileSync(OUT_PATH, report, 'utf8')
    console.error(`bench: wrote ${OUT_PATH}`)
  }

  const breaches = measurements.filter((m) => m.stats.p95 > m.budgetMs)
  process.exit(breaches.length === 0 ? 0 : 2)
}

function renderReport(
  measurements: Measurement[],
  plans: Array<{ label: string; plan: string }>,
  seedCounts: Record<string, string> | undefined,
): string {
  const ms = (n: number) => n.toFixed(1)
  const lines: string[] = []
  lines.push(`<!-- generated by scripts/bench-owner-scoped-routes.ts on ${new Date().toISOString()} -->`)
  lines.push('')
  lines.push('## Dataset')
  lines.push('')
  if (seedCounts) {
    lines.push('| table | rows |')
    lines.push('| --- | ---: |')
    for (const [k, v] of Object.entries(seedCounts)) lines.push(`| \`${k}\` | ${v} |`)
  } else {
    lines.push('_(re-used an existing seeded bench database; `--no-seed`)_')
  }
  lines.push('')
  lines.push(`Warmup ${WARMUP} iterations per op, discarded. Samples as listed per row.`)
  lines.push('')
  lines.push('## Results')
  lines.push('')
  lines.push('| operation | n | p50 (ms) | p95 (ms) | p99 (ms) | budget p95 | verdict |')
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | :---: |')
  for (const m of measurements) {
    const pass = m.stats.p95 <= m.budgetMs
    lines.push(
      `| \`${m.op}\` | ${m.stats.n} | ${ms(m.stats.p50)} | ${ms(m.stats.p95)} | ${ms(m.stats.p99)} | ` +
        `${m.budgetMs} ms | ${pass ? 'PASS' : 'FAIL'} |`,
    )
  }
  lines.push('')
  lines.push('## Query plans — `EXPLAIN (ANALYZE, BUFFERS)`')
  lines.push('')
  for (const p of plans) {
    lines.push(`### ${p.label}`)
    lines.push('')
    lines.push('```')
    lines.push(p.plan)
    lines.push('```')
    lines.push('')
  }
  return lines.join('\n')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
