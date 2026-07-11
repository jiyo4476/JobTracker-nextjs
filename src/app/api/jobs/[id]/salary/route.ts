import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { jobs } from '@/db/schema'
import { requireApiKey } from '@/lib/auth'
import { jobSalaryPatchSchema } from '@/lib/schemas'
import { logger, serializeError } from '@/lib/logger'
import { eq } from 'drizzle-orm'

function annualEquivalentFromHourly(value: number | null | undefined) {
  if (value === undefined) return undefined
  if (value === null) return null
  return Math.round(value * 2080 * 100)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireApiKey(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const jobId = parseInt(id)
  if (isNaN(jobId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const parsed = jobSalaryPatchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const d = parsed.data
  // salary_min/salary_max arrive as annual-equivalent cents, matching jobPatchSchema's contract.
  const salaryMinCents = d.salary_min
  const salaryMaxCents = d.salary_max
  const hourlyRateMin = d.hourly_rate_min
  const hourlyRateMax = d.hourly_rate_max
  const annualRangeProvided = salaryMinCents !== undefined || salaryMaxCents !== undefined
  const hourlyRangeProvided = hourlyRateMin !== undefined || hourlyRateMax !== undefined

  try {
    let nextSalaryType = d.salary_type
    if (nextSalaryType === undefined) {
      if (hourlyRangeProvided) nextSalaryType = 'hourly'
      else if (annualRangeProvided) nextSalaryType = 'annual'
    }

    const annualEquivalentMin =
      nextSalaryType === 'hourly'
        ? annualEquivalentFromHourly(hourlyRateMin)
        : salaryMinCents
    const annualEquivalentMax =
      nextSalaryType === 'hourly'
        ? annualEquivalentFromHourly(hourlyRateMax)
        : salaryMaxCents

    const [updated] = await db
      .update(jobs)
      .set({
        ...(nextSalaryType !== undefined && { salaryType: nextSalaryType }),
        ...(salaryMinCents !== undefined && { salaryMin: salaryMinCents }),
        ...(salaryMaxCents !== undefined && { salaryMax: salaryMaxCents }),
        ...(hourlyRateMin !== undefined && { hourlyRateMin: hourlyRateMin === null ? null : hourlyRateMin.toString() }),
        ...(hourlyRateMax !== undefined && { hourlyRateMax: hourlyRateMax === null ? null : hourlyRateMax.toString() }),
        ...(annualEquivalentMin !== undefined && { annualEquivalentMin }),
        ...(annualEquivalentMax !== undefined && { annualEquivalentMax }),
        ...(nextSalaryType === 'annual' && annualRangeProvided && { hourlyRateMin: null, hourlyRateMax: null }),
        ...(nextSalaryType === 'hourly' && hourlyRangeProvided && { salaryMin: null, salaryMax: null }),
        ...(d.salary_type === null && {
          salaryMin: null,
          salaryMax: null,
          hourlyRateMin: null,
          hourlyRateMax: null,
          annualEquivalentMin: null,
          annualEquivalentMax: null,
        }),
        ...(d.salary_currency !== undefined && { salaryCurrency: d.salary_currency }),
        ...(d.salary_text !== undefined && { salaryText: d.salary_text }),
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId))
      .returning({
        id: jobs.id,
        salaryType: jobs.salaryType,
        salaryMin: jobs.salaryMin,
        salaryMax: jobs.salaryMax,
        hourlyRateMin: jobs.hourlyRateMin,
        hourlyRateMax: jobs.hourlyRateMax,
        annualEquivalentMin: jobs.annualEquivalentMin,
        annualEquivalentMax: jobs.annualEquivalentMax,
        salaryCurrency: jobs.salaryCurrency,
        salaryText: jobs.salaryText,
      })

    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    logger.info('job salary updated', { jobId })
    return NextResponse.json(updated)
  } catch (err) {
    logger.error('PATCH /api/jobs/[id]/salary failed', { jobId, ...serializeError(err) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
