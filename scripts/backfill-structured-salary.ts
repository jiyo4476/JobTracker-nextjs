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
 *  - Conservative: it targets unclassified/incomplete rows plus the known
 *    underscaled legacy-annual signature. Complete, plausible structured
 *    salaries remain authoritative and are never overwritten.
 *  - Rows whose `salary_text` can't be parsed into a valid range are skipped.
 *  - All writes run inside a single transaction.
 *  - Each target is re-read under a row lock before update, preventing a
 *    concurrent application write from being overwritten by a stale plan.
 *  - Idempotent: successfully repaired rows no longer require backfill.
 *
 * USAGE (needs DATABASE_URL in the environment):
 *   npm run db:backfill-salary            # dry run — prints planned changes
 *   npm run db:backfill-salary -- --apply # writes the changes
 */
import { eq, isNotNull } from 'drizzle-orm'
// Relative imports (not the `@/` alias) so the script runs under plain `tsx`
// without a tsconfig-paths loader.
import { db } from '../src/db'
import { jobs } from '../src/db/schema'
import { needsStructuredSalaryBackfill, structuredSalaryFromText } from '../src/lib/salary-format'

const APPLY = process.argv.includes('--apply')

async function main(): Promise<void> {
  const candidates = await db
    .select({
      id: jobs.id,
      salaryText: jobs.salaryText,
      salaryType: jobs.salaryType,
      salaryMin: jobs.salaryMin,
      salaryMax: jobs.salaryMax,
      hourlyRateMin: jobs.hourlyRateMin,
      hourlyRateMax: jobs.hourlyRateMax,
    })
    .from(jobs)
    .where(isNotNull(jobs.salaryText))

  const evaluated = candidates.map((row) => ({
    ...row,
    parsed: structuredSalaryFromText(row.salaryText),
  }))
  const planned = evaluated
    .filter((row): row is typeof row & { parsed: NonNullable<typeof row.parsed> } => row.parsed !== null)
    .filter((row) => needsStructuredSalaryBackfill(row, row.parsed))

  const unparseable = evaluated.filter((row) => row.parsed === null).length
  const alreadyStructured = candidates.length - planned.length - unparseable

  for (const row of planned) {
    const p = row.parsed
    const summary =
      p.salaryType === 'annual'
        ? `annual ${p.salaryMin}–${p.salaryMax}¢`
        : `hourly $${p.hourlyRateMin}–$${p.hourlyRateMax}/hr (annual-eq ${p.annualEquivalentMin}–${p.annualEquivalentMax}¢)`
    console.log(`${APPLY ? 'UPDATE' : 'WOULD UPDATE'} job ${row.id}: ${JSON.stringify(row.salaryText)} → ${summary}`)
  }

  let applied = 0
  if (APPLY && planned.length > 0) {
    await db.transaction(async (tx) => {
      for (const row of planned) {
        // Re-read under a row lock so a concurrent application update cannot be
        // overwritten using the stale candidate snapshot taken above.
        const [current] = await tx
          .select({
            salaryText: jobs.salaryText,
            salaryType: jobs.salaryType,
            salaryMin: jobs.salaryMin,
            salaryMax: jobs.salaryMax,
            hourlyRateMin: jobs.hourlyRateMin,
            hourlyRateMax: jobs.hourlyRateMax,
          })
          .from(jobs)
          .where(eq(jobs.id, row.id))
          .for('update')
        if (!current) continue

        const p = structuredSalaryFromText(current.salaryText)
        if (!p || !needsStructuredSalaryBackfill(current, p)) continue

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
        applied++
      }
    })
  }

  console.log(
    `\n${candidates.length} row(s) with salary_text; ${planned.length} require backfill, ` +
      `${alreadyStructured} already have authoritative structured values, ` +
      `${unparseable} unparseable (skipped).`,
  )
  console.log(
    APPLY
      ? `Applied ${applied} update(s).`
      : 'Dry run — no rows changed. Re-run with `-- --apply` to write.',
  )
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('backfill-structured-salary failed:', err)
    process.exit(1)
  })
