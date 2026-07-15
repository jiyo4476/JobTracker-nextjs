import { NextResponse } from 'next/server'
import { db } from '@/db'
import { jobs, skills, jobSkills } from '@/db/schema'
import { logger, serializeError } from '@/lib/logger'
import { eq, and, inArray, count, sql } from 'drizzle-orm'

export async function GET() {
  try {
    return await getStats()
  } catch (err) {
    logger.error('GET /api/stats failed', serializeError(err))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function getStats() {
  // All aggregates exclude soft-deleted jobs (DELETE /api/jobs/[id] sets
  // is_active = false), matching the jobs list default.
  const activeJobs = eq(jobs.isActive, true)

  const [
    [{ totalJobs }],
    [{ applied }],
    [{ activeInterviews }],
    [{ staleListings }],
    topSkills,
    weeklyJobCounts,
    [{ remoteCount }],
    [{ onsiteCount }],
    stageCounts,
  ] = await Promise.all([
    db.select({ totalJobs: count() }).from(jobs).where(activeJobs),
    db.select({ applied: count() }).from(jobs).where(and(eq(jobs.hasApplied, true), activeJobs)),
    db.select({ activeInterviews: count() }).from(jobs).where(
      and(inArray(jobs.interviewStage, ['phone_screen', 'technical_screen', 'onsite']), activeJobs)
    ),
    db.select({ staleListings: count() }).from(jobs).where(
      and(eq(jobs.isActive, true), eq(jobs.hasApplied, false))
    ),
    db.select({
      name: skills.name,
      jobCount: sql<number>`cast(count(${jobs.id}) as int)`,
    })
      .from(skills)
      .leftJoin(jobSkills, eq(skills.id, jobSkills.skillId))
      .leftJoin(jobs, and(eq(jobSkills.jobId, jobs.id), activeJobs))
      .groupBy(skills.id, skills.name)
      .orderBy(sql`count(${jobs.id}) desc`)
      .limit(15),
    db.select({
      week: sql<string>`date_trunc('week', ${jobs.dateFound}::timestamp)`,
      jobCount: sql<number>`cast(count(*) as int)`,
    })
      .from(jobs)
      .where(and(activeJobs, sql`${jobs.dateFound} >= now() - interval '12 weeks'`))
      .groupBy(sql`date_trunc('week', ${jobs.dateFound}::timestamp)`)
      .orderBy(sql`date_trunc('week', ${jobs.dateFound}::timestamp)`),
    db.select({ remoteCount: count() }).from(jobs).where(and(eq(jobs.isRemote, true), activeJobs)),
    db.select({ onsiteCount: count() }).from(jobs).where(and(eq(jobs.isRemote, false), activeJobs)),
    db.select({
      stage: jobs.interviewStage,
      count: sql<number>`cast(count(*) as int)`,
    })
      .from(jobs)
      .where(activeJobs)
      .groupBy(jobs.interviewStage),
  ])

  const res = NextResponse.json({
    totalJobs,
    applied,
    activeInterviews,
    staleListings,
    topSkills,
    weeklyJobCounts,
    remoteCount,
    onsiteCount,
    stageCounts,
  })
  res.headers.set('Cache-Control', 's-maxage=60, stale-while-revalidate=60')
  return res
}
