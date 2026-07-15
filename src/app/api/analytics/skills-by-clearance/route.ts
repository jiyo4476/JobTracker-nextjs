import { NextResponse } from 'next/server'
import { db } from '@/db'
import { logger, serializeError } from '@/lib/logger'
import { sql } from 'drizzle-orm'

export async function GET() {
  try {
    return await getSkillsByClearance()
  } catch (err) {
    logger.error('GET /api/analytics/skills-by-clearance failed', serializeError(err))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Top 15 skills for one clearance group. `percentage` is each skill's share of
// the group's TOTAL skill occurrences (window aggregate runs over the whole
// skill_counts CTE, before the LIMIT), rounded to 1 decimal.
// NULL security_clearance_req is treated as not-required (`IS NOT TRUE`) — the
// column defaults to false but is nullable.
function topSkillsForClearance(clearanceRequired: boolean) {
  const clearanceFilter = clearanceRequired
    ? sql`j.security_clearance_req IS TRUE`
    : sql`j.security_clearance_req IS NOT TRUE`

  return db.execute(sql`
    WITH skill_counts AS (
      SELECT s.name AS skill,
             COUNT(*) AS cnt
      FROM job_skills js
      JOIN skills s ON js.skill_id = s.id
      JOIN jobs j ON js.job_id = j.id
      WHERE ${clearanceFilter}
      GROUP BY s.name
    )
    SELECT skill,
           CAST(cnt AS int) AS count,
           CAST(ROUND(cnt * 100.0 / SUM(cnt) OVER (), 1) AS float8) AS percentage
    FROM skill_counts
    ORDER BY cnt DESC, skill ASC
    LIMIT 15
  `)
}

async function getSkillsByClearance() {
  const [clearanceRequired, clearanceNotRequired] = await Promise.all([
    topSkillsForClearance(true),
    topSkillsForClearance(false),
  ])

  const res = NextResponse.json({
    clearance_required: clearanceRequired,
    clearance_not_required: clearanceNotRequired,
  })
  res.headers.set('Cache-Control', 's-maxage=60, stale-while-revalidate=60')
  return res
}
