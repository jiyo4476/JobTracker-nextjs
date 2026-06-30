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

  const ALLOWED_PLATFORMS = new Set(['linkedin','indeed','glassdoor','dice','lever','greenhouse','workday','angellist','direct','other'])
  const platform = platformRaw && ALLOWED_PLATFORMS.has(platformRaw) ? platformRaw : null
  const clearance = clearanceRaw === 'true' || clearanceRaw === 'false' ? clearanceRaw : null

  const dateFilters = []
  if (from) dateFilters.push(gte(jobs.dateFound, from))
  if (to) dateFilters.push(lte(jobs.dateFound, to))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (platform) dateFilters.push(eq(jobs.sourcePlatform, platform as any))
  const where = dateFilters.length > 0 ? and(...dateFilters) : undefined

  const [skillDemandOverTime, salaryDistribution, platformBreakdown, remoteVsOnsiteByWeek] = await Promise.all([
    // Top 15 skills by month over date_posted, optionally scoped by clearance.
    db.execute(sql`
      SELECT s.name AS skill,
             DATE_TRUNC('month', j.date_posted::timestamp) AS month,
             CAST(COUNT(*) AS int) AS count
      FROM skills s
      JOIN job_skills js ON s.id = js.skill_id
      JOIN jobs j ON js.job_id = j.id
      WHERE s.id IN (
        SELECT skill_id FROM job_skills
        JOIN jobs top_jobs ON job_skills.job_id = top_jobs.id
        WHERE 1 = 1
        ${from ? sql`AND top_jobs.date_found >= ${from}::date` : sql``}
        ${to ? sql`AND top_jobs.date_found <= ${to}::date` : sql``}
        ${platform ? sql`AND top_jobs.source_platform = ${platform}` : sql``}
        ${clearance === 'true' ? sql`AND top_jobs.security_clearance_req = true` : sql``}
        ${clearance === 'false' ? sql`AND top_jobs.security_clearance_req = false` : sql``}
        GROUP BY skill_id ORDER BY COUNT(*) DESC LIMIT 15
      )
      ${from ? sql`AND j.date_found >= ${from}::date` : sql``}
      ${to ? sql`AND j.date_found <= ${to}::date` : sql``}
      ${platform ? sql`AND j.source_platform = ${platform}` : sql``}
      ${clearance === 'true' ? sql`AND j.security_clearance_req = true` : sql``}
      ${clearance === 'false' ? sql`AND j.security_clearance_req = false` : sql``}
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
