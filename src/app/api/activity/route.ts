import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { withUser } from '@/db/session'
import { privateJson } from '@/lib/http'
import { resolveRequestUser } from '@/lib/resolved-user'
import { userJobStatusHistory, jobs, companies } from '@/db/schema'
import { logger, serializeError } from '@/lib/logger'
import { eq, desc } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  // API-013 (slice 2): the recent-activity feed is PERSONAL — it reads only the
  // caller's user_job_status_history. Requires a resolved interactive user; no
  // shared caching (was s-maxage), because this is per-user state.
  const auth = await resolveRequestUser(req)
  if (!auth.ok) return auth.response

  try {
    return await getActivity(auth.user.id)
  } catch (err) {
    logger.error('GET /api/activity failed', serializeError(err))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function getActivity(userId: number) {
  return withUser(userId, async (tx) => {
    // Owner predicate pins user_id to the caller (defense in depth on RLS). Job title
    // and company name are global catalog facts, joined for display only.
    const rows = await tx
      .select({
        id: userJobStatusHistory.id,
        jobId: userJobStatusHistory.jobId,
        jobTitle: jobs.jobTitle,
        companyName: companies.name,
        fromStage: userJobStatusHistory.fromStage,
        toStage: userJobStatusHistory.toStage,
        changedAt: userJobStatusHistory.changedAt,
      })
      .from(userJobStatusHistory)
      .innerJoin(jobs, eq(userJobStatusHistory.jobId, jobs.id))
      .leftJoin(companies, eq(jobs.companyId, companies.id))
      .where(eq(userJobStatusHistory.userId, userId))
      .orderBy(desc(userJobStatusHistory.changedAt))
      .limit(20)

    const data = rows.map((r) => {
      if (!r.changedAt) throw new Error(`Activity row ${r.id} is missing changedAt`)

      return {
        id: r.id,
        jobId: r.jobId,
        jobTitle: r.jobTitle,
        companyName: r.companyName ?? null,
        fromStage: r.fromStage ?? null,
        toStage: r.toStage,
        changedAt: r.changedAt.toISOString(),
      }
    })

    return privateJson(data)
  })
}
