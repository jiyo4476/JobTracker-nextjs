import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { withUser } from '@/db/session'
import { privateJson } from '@/lib/http'
import { resolveRequestUser } from '@/lib/resolved-user'
import { jobs, skills, jobSkills, userJobState } from '@/db/schema'
import { logger, serializeError } from '@/lib/logger'
import { eq, and, inArray, count, isNull, sql } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  // API-013 (slice 2): application KPIs and the funnel are PERSONAL — they come from
  // the caller's user_job_state overlay, so this route now requires a resolved
  // interactive user and never caches per-user results. Catalog supply metrics
  // (global job/skill counts) are returned separately under `catalog` so a private
  // numerator is never silently combined with a global denominator.
  const auth = await resolveRequestUser(req)
  if (!auth.ok) return auth.response

  try {
    return await getStats(auth.user.id)
  } catch (err) {
    logger.error('GET /api/stats failed', serializeError(err))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function getStats(userId: number) {
  // Catalog supply metrics exclude soft-deleted jobs (DELETE /api/jobs/[id] sets
  // is_active = false), matching the jobs list default.
  const activeJobs = eq(jobs.isActive, true)

  return withUser(userId, async (tx) => {
    // Owner predicate for every personal aggregate: pin user_id to the resolved
    // caller (defense in depth on top of the RLS context withUser sets). Personal
    // KPIs count only the caller's non-hidden tracked jobs whose catalog row is
    // still active (not soft-deleted).
    const ownedTracked = and(
      eq(userJobState.userId, userId),
      eq(userJobState.isHidden, false),
      eq(jobs.isActive, true),
      isNull(jobs.deletedAt),
    )

    const [
      // ── Personal application KPIs (caller's user_job_state) ──
      [{ trackedJobs }],
      [{ applied }],
      [{ activeInterviews }],
      [{ staleListings }],
      stageCounts,
      // ── Catalog supply metrics (global) ──
      [{ totalJobs }],
      topSkills,
      weeklyJobCounts,
      [{ remoteCount }],
      [{ onsiteCount }],
    ] = await Promise.all([
      tx.select({ trackedJobs: count() }).from(userJobState)
        .innerJoin(jobs, eq(userJobState.jobId, jobs.id)).where(ownedTracked),
      tx.select({ applied: count() }).from(userJobState)
        .innerJoin(jobs, eq(userJobState.jobId, jobs.id))
        .where(and(ownedTracked, eq(userJobState.hasApplied, true))),
      tx.select({ activeInterviews: count() }).from(userJobState)
        .innerJoin(jobs, eq(userJobState.jobId, jobs.id))
        .where(and(ownedTracked, inArray(userJobState.interviewStage, ['phone_screen', 'technical_screen', 'onsite']))),
      tx.select({ staleListings: count() }).from(userJobState)
        .innerJoin(jobs, eq(userJobState.jobId, jobs.id))
        .where(and(ownedTracked, eq(userJobState.hasApplied, false))),
      tx.select({
        stage: userJobState.interviewStage,
        count: sql<number>`cast(count(*) as int)`,
      })
        .from(userJobState)
        .innerJoin(jobs, eq(userJobState.jobId, jobs.id))
        .where(ownedTracked)
        .groupBy(userJobState.interviewStage),

      tx.select({ totalJobs: count() }).from(jobs).where(and(activeJobs, isNull(jobs.deletedAt))),
      tx.select({
        name: skills.name,
        jobCount: sql<number>`cast(count(${jobs.id}) as int)`,
      })
        .from(skills)
        .leftJoin(jobSkills, eq(skills.id, jobSkills.skillId))
        .leftJoin(jobs, and(eq(jobSkills.jobId, jobs.id), activeJobs))
        .groupBy(skills.id, skills.name)
        .orderBy(sql`count(${jobs.id}) desc`)
        .limit(15),
      tx.select({
        week: sql<string>`date_trunc('week', ${jobs.dateFound}::timestamp)`,
        jobCount: sql<number>`cast(count(*) as int)`,
      })
        .from(jobs)
        .where(and(activeJobs, sql`${jobs.dateFound} >= now() - interval '12 weeks'`))
        .groupBy(sql`date_trunc('week', ${jobs.dateFound}::timestamp)`)
        .orderBy(sql`date_trunc('week', ${jobs.dateFound}::timestamp)`),
      tx.select({ remoteCount: count() }).from(jobs).where(and(eq(jobs.isRemote, true), activeJobs)),
      tx.select({ onsiteCount: count() }).from(jobs).where(and(eq(jobs.isRemote, false), activeJobs)),
    ])

    return privateJson({
      scope: 'personal',
      // Personal application KPIs — caller's user_job_state only.
      trackedJobs,
      applied,
      activeInterviews,
      staleListings,
      stageCounts,
      // Catalog supply metrics — GLOBAL, not caller-specific. Never use one of these
      // as a denominator for a personal numerator without naming that contract.
      catalog: {
        totalJobs,
        topSkills,
        weeklyJobCounts,
        remoteCount,
        onsiteCount,
      },
    })
  })
}
