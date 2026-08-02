/**
 * Backfill structured salary columns from `salary_text` for legacy rows.
 *
 * TECHDEBT-009 flipped `formatSalary` so the structured cents / hourly-rate
 * columns are authoritative and `salary_text` is only a fallback. Legacy rows
 * imported before that (some normalized by PR #66) may carry a usable
 * `salary_text` but empty structured columns — those would now render "—".
 * This script parses each such row's `salary_text` with the SAME parser the UI
 * uses ({@link structuredSalaryFromText}) and fills the structured columns.
 *
 * SAFETY:
 *  - Dry run by DEFAULT. It only writes when invoked with `--apply`.
 *  - Non-destructive: it targets ONLY rows where `salary_type IS NULL` (never
 *    classified), so a row that already has structured salary is never touched.
 *  - Rows whose `salary_text` can't be parsed into a valid range are skipped.
 *  - All writes run inside a single transaction.
 *  - Idempotent: after a successful `--apply`, updated rows have a `salary_type`
 *    and are no longer candidates.
 *
 * USAGE (needs DATABASE_URL in the environment):
 *   npm run db:backfill-salary            # dry run — prints planned changes
 *   npm run db:backfill-salary -- --apply # writes the changes
 */
import { and, eq, isNull, isNotNull } from 'drizzle-orm'
// Relative imports (not the `@/` alias) so the script runs under plain `tsx`
// without a tsconfig-paths loader.
import { db } from '../src/db'
import { jobs } from '../src/db/schema'
import { structuredSalaryFromText } from '../src/lib/salary-format'

const APPLY = process.argv.includes('--apply')

async function main(): Promise<void> {
  const candidates = await db
    .select({ id: jobs.id, salaryText: jobs.salaryText })
    .from(jobs)
    .where(and(isNotNull(jobs.salaryText), isNull(jobs.salaryType)))

  const planned = candidates
    .map((row) => ({ id: row.id, salaryText: row.salaryText, parsed: structuredSalaryFromText(row.salaryText) }))
    .filter((row): row is typeof row & { parsed: NonNullable<typeof row.parsed> } => row.parsed !== null)

  const skipped = candidates.length - planned.length

  for (const row of planned) {
    const p = row.parsed
    const summary =
      p.salaryType === 'annual'
        ? `annual ${p.salaryMin}–${p.salaryMax}¢`
        : `hourly $${p.hourlyRateMin}–$${p.hourlyRateMax}/hr (annual-eq ${p.annualEquivalentMin}–${p.annualEquivalentMax}¢)`
    console.log(`${APPLY ? 'UPDATE' : 'WOULD UPDATE'} job ${row.id}: ${JSON.stringify(row.salaryText)} → ${summary}`)
  }

  if (APPLY && planned.length > 0) {
    await db.transaction(async (tx) => {
      for (const row of planned) {
        const p = row.parsed
        await tx
          .update(jobs)
          .set({
            salaryType: p.salaryType,
            salaryMin: p.salaryMin,
            salaryMax: p.salaryMax,
            hourlyRateMin: p.hourlyRateMin,
            hourlyRateMax: p.hourlyRateMax,
            annualEquivalentMin: p.annualEquivalentMin,
            annualEquivalentMax: p.annualEquivalentMax,
            updatedAt: new Date(),
          })
          .where(eq(jobs.id, row.id))
      }
    })
  }

  console.log(
    `\n${candidates.length} candidate row(s) with salary_text and no salary_type; ` +
      `${planned.length} parseable, ${skipped} unparseable (skipped).`,
  )
  console.log(
    APPLY
      ? `Applied ${planned.length} update(s).`
      : 'Dry run — no rows changed. Re-run with `-- --apply` to write.',
  )
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('backfill-structured-salary failed:', err)
    process.exit(1)
  })
