import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { jobs } from '@/db/schema'
import { eq, sql, and, gte, lte } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const fromRaw = searchParams.get('from')
  const toRaw = searchParams.get('to')
  const platformRaw = searchParams.get('platform')
  const clearanceRaw = searchParams.get('security_clearance')

  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
  const from = fromRaw && ISO_DATE.test(fromRaw) ? fromRaw : null
  const to = toRaw && ISO_DATE.test(toRaw) ? toRaw : null

  const ALLOWED_PLATFORMS = new Set(['linkedin','indeed','glassdoor','dice','lever','greenhouse','workday','angellist','direct','other','google'])
  const platform = platformRaw && ALLOWED_PLATFORMS.has(platformRaw) ? platformRaw : null
  const clearance =
    clearanceRaw === 'true' ? true :
    clearanceRaw === 'false' ? false :
    null

  const dateFilters = []
  if (from) dateFilters.push(gte(jobs.dateFound, from))
  if (to) dateFilters.push(lte(jobs.dateFound, to))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (platform) dateFilters.push(eq(jobs.sourcePlatform, platform as any))
  const where = dateFilters.length > 0 ? and(...dateFilters) : undefined

  const [skillDemandOverTime, salaryDistribution, platformBreakdown, remoteVsOnsiteByWeek] = await Promise.all([
    // Top 15 skills by month over date_posted, optionally scoped by clearance.
    db.execute(sql`
      WITH filtered_jobs AS (
        SELECT *
        FROM jobs
        WHERE 1 = 1
        ${from ? sql`AND date_found >= ${from}::date` : sql``}
        ${to ? sql`AND date_found <= ${to}::date` : sql``}
        ${platform ? sql`AND source_platform = ${platform}` : sql``}
        ${clearance !== null ? sql`AND security_clearance_req = ${clearance}` : sql``}
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
      ${from ? sql`AND date_found >= ${from}::date` : sql``}
      ${to ? sql`AND date_found <= ${to}::date` : sql``}
      ${platform ? sql`AND source_platform = ${platform}` : sql``}
      GROUP BY job_type, experience_level
      ORDER BY job_type, experience_level
    `),

    // Platform breakdown
    db.execute(sql`
      SELECT source_platform AS platform,
             CAST(COUNT(*) AS int) AS count
      FROM jobs
      ${where ? sql`WHERE ${where}` : sql``}
      GROUP BY source_platform
      ORDER BY count DESC
    `),

    // Remote vs onsite by week
    db.execute(sql`
      SELECT DATE_TRUNC('week', date_found::timestamp) AS week,
             CAST(SUM(CASE WHEN is_remote = true THEN 1 ELSE 0 END) AS int) AS remote,
             CAST(SUM(CASE WHEN is_remote = false THEN 1 ELSE 0 END) AS int) AS onsite
      FROM jobs
      ${where ? sql`WHERE ${where}` : sql``}
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
