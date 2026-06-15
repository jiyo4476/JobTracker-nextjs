import { NextResponse } from 'next/server'
import { db } from '@/db'
import { jobs, skills, jobSkills } from '@/db/schema'
import { eq, and, inArray, count, sql } from 'drizzle-orm'

export async function GET() {
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
    db.select({ totalJobs: count() }).from(jobs),
    db.select({ applied: count() }).from(jobs).where(eq(jobs.hasApplied, true)),
    db.select({ activeInterviews: count() }).from(jobs).where(
      inArray(jobs.interviewStage, ['phone_screen', 'technical_screen', 'onsite'])
    ),
    db.select({ staleListings: count() }).from(jobs).where(
      and(eq(jobs.isActive, false), eq(jobs.hasApplied, false))
    ),
    db.select({
      name: skills.name,
      jobCount: sql<number>`cast(count(${jobSkills.jobId}) as int)`,
    })
      .from(skills)
      .leftJoin(jobSkills, eq(skills.id, jobSkills.skillId))
      .groupBy(skills.id, skills.name)
      .orderBy(sql`count(${jobSkills.jobId}) desc`)
      .limit(15),
    db.select({
      week: sql<string>`date_trunc('week', ${jobs.dateFound}::timestamp)`,
      jobCount: sql<number>`cast(count(*) as int)`,
    })
      .from(jobs)
      .where(sql`${jobs.dateFound} >= now() - interval '12 weeks'`)
      .groupBy(sql`date_trunc('week', ${jobs.dateFound}::timestamp)`)
      .orderBy(sql`date_trunc('week', ${jobs.dateFound}::timestamp)`),
    db.select({ remoteCount: count() }).from(jobs).where(eq(jobs.isRemote, true)),
    db.select({ onsiteCount: count() }).from(jobs).where(eq(jobs.isRemote, false)),
    db.select({
      stage: jobs.interviewStage,
      count: sql<number>`cast(count(*) as int)`,
    })
      .from(jobs)
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
  res.headers.set('Cache-Control', 's-maxage=60, stale-while-revalidate')
  return res
}
