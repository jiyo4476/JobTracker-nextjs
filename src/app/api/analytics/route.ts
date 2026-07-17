import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { sourcePlatformEnum } from '@/lib/schemas'
import { logger, serializeError } from '@/lib/logger'
import { sql } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  try {
    return await getAnalytics(req)
  } catch (err) {
    logger.error('GET /api/analytics failed', serializeError(err))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function getAnalytics(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const fromRaw = searchParams.get('from')
  const toRaw = searchParams.get('to')
  const platformRaw = searchParams.get('platform')
  const clearanceRaw = searchParams.get('security_clearance')

  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
  const from = fromRaw && ISO_DATE.test(fromRaw) ? fromRaw : null
  const to = toRaw && ISO_DATE.test(toRaw) ? toRaw : null

  const platformParsed = sourcePlatformEnum.safeParse(platformRaw)
  const platform = platformParsed.success ? platformParsed.data : null
  const clearance =
    clearanceRaw === 'true' ? true :
    clearanceRaw === 'false' ? false :
    null

  // Base filter shared by all four queries: active (not soft-deleted) jobs
  // within the optional date/platform scope.
  const baseFilter = sql`is_active IS TRUE
        ${from ? sql`AND date_found >= ${from}::date` : sql``}
        ${to ? sql`AND date_found <= ${to}::date` : sql``}
        ${platform ? sql`AND source_platform = ${platform}` : sql``}`

  // NULL security_clearance_req counts as not-required (the column is nullable,
  // default false) — same semantics as /api/analytics/skills-by-clearance.
  const clearanceFilter =
    clearance === null ? sql`` :
    clearance ? sql`AND security_clearance_req IS TRUE` :
    sql`AND security_clearance_req IS NOT TRUE`

  const [skillDemandOverTime, salaryDistribution, platformBreakdown, remoteVsOnsiteByWeek] = await Promise.all([
    // Top 15 skills by month over date_posted, optionally scoped by clearance.
    db.execute(sql`
      WITH filtered_jobs AS (
        SELECT *
        FROM jobs
        WHERE ${baseFilter}
        ${clearanceFilter}
      )
      SELECT s.name AS skill,
             DATE_TRUNC('month', j.date_posted::timestamp) AS month,
             CAST(COUNT(*) AS int) AS count
      FROM job_skills js
      JOIN skills s ON js.skill_id = s.id
      JOIN filtered_jobs j ON js.job_id = j.id
      WHERE s.id IN (
        SELECT top_job_skills.skill_id
        FROM job_skills top_job_skills
        JOIN filtered_jobs top_jobs ON top_job_skills.job_id = top_jobs.id
        GROUP BY top_job_skills.skill_id
        ORDER BY COUNT(*) DESC
        LIMIT 15
      )
      GROUP BY s.name, DATE_TRUNC('month', j.date_posted::timestamp)
      ORDER BY month, count DESC
    `),

    // Salary distribution by job_type + experience_level
    db.execute(sql`
      SELECT job_type,
             experience_level,
             CAST(AVG(annual_equivalent_min) AS int) AS avg_min,
             CAST(MIN(annual_equivalent_min) AS int) AS min_val,
             CAST(MAX(annual_equivalent_min) AS int) AS max_val
      FROM jobs
      WHERE annual_equivalent_min IS NOT NULL
      AND ${baseFilter}
      ${clearanceFilter}
      GROUP BY job_type, experience_level
      ORDER BY job_type, experience_level
    `),

    // Platform breakdown
    db.execute(sql`
      SELECT source_platform AS platform,
             CAST(COUNT(*) AS int) AS count
      FROM jobs
      WHERE ${baseFilter}
      ${clearanceFilter}
      GROUP BY source_platform
      ORDER BY count DESC
    `),

    // Remote vs onsite by week
    db.execute(sql`
      SELECT DATE_TRUNC('week', date_found::timestamp) AS week,
             CAST(SUM(CASE WHEN is_remote = true THEN 1 ELSE 0 END) AS int) AS remote,
             CAST(SUM(CASE WHEN is_remote = false THEN 1 ELSE 0 END) AS int) AS onsite
      FROM jobs
      WHERE ${baseFilter}
      ${clearanceFilter}
      GROUP BY DATE_TRUNC('week', date_found::timestamp)
      ORDER BY week
    `),
  ])

  return NextResponse.json({
    skillDemandOverTime,
    salaryDistribution,
    platformBreakdown,
    remoteVsOnsiteByWeek,
  })
}
