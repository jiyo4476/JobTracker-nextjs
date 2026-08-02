import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { requireAuth } from '@/lib/http'
import { upsertLookupIds } from '@/lib/db-utils'
import { extractTags } from '@/lib/nlp-extract'
import { logger } from '@/lib/logger'
import { jobs, skills, jobSkills } from '@/db/schema'
import { sql } from 'drizzle-orm'

// POST /api/jobs/backfill-skills
// Legacy skills-only backfill. Prefer POST /api/jobs/backfill-tags, which
// attaches software and certifications as well (TAXONOMY-001).
// Re-runs NLP skill extraction on every job that has a description but no linked skills.
// Safe to call multiple times — uses INSERT ... ON CONFLICT DO NOTHING.
//
// Params:
//   ?limit=N     batch size (default 100, max 500)
//   ?cursor=ID   resume after this job id (exclusive; default 0)
//
// The candidate query is ordered by id and bounded by `id > cursor`, and the
// returned `next_cursor` advances past EVERY candidate examined — including jobs
// whose descriptions extract zero skills. Without this, zero-skill jobs match the
// `NOT EXISTS (job_skills)` filter on every run and were reprocessed forever with
// no forward progress. Callers sweep by passing the returned next_cursor until
// `done` is true.
// Each job's writes run in a transaction so a mid-run timeout leaves no partial rows.
export async function POST(req: NextRequest) {
  const denied = await requireAuth(req)
  if (denied) return denied

  const requestedLimit = Number(req.nextUrl.searchParams.get('limit') ?? '100')
  const limit =
    Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 500)
      : 100

  const requestedCursor = Number(req.nextUrl.searchParams.get('cursor') ?? '0')
  const cursor = Number.isFinite(requestedCursor) && requestedCursor > 0 ? requestedCursor : 0

  // Find jobs past the cursor that have a description but zero linked skills,
  // ordered by id so the cursor makes deterministic forward progress.
  const candidates = await db
    .select({ id: jobs.id, jobDescription: jobs.jobDescription })
    .from(jobs)
    .where(
      sql`${jobs.id} > ${cursor}
        and ${jobs.jobDescription} is not null
        and ${jobs.jobDescription} <> ''
        and not exists (
          select 1 from job_skills where job_skills.job_id = ${jobs.id}
        )`
    )
    .orderBy(jobs.id)
    .limit(limit)

  const done = candidates.length < limit

  logger.info('backfill-skills: candidates found', { count: candidates.length, limit, cursor })

  let processed = 0
  let skillsLinked = 0 // upper bound — counts IDs resolved, not net-new junction rows
  let nextCursor = cursor

  for (const job of candidates) {
    // Advance the cursor for every candidate examined, so a zero-skill job is
    // not revisited on the next page of the same sweep.
    nextCursor = job.id
    if (!job.jobDescription) continue

    const { skills: extracted } = extractTags(job.jobDescription)
    if (extracted.length === 0) continue

    // Wrap per-job writes in a transaction so a timeout or crash mid-loop
    // doesn't leave partial job_skills rows (which would exclude the job from
    // the next backfill run via the NOT EXISTS check).
    await db.transaction(async tx => {
      const skillIds = await upsertLookupIds(tx, skills, extracted)
      if (skillIds.length > 0) {
        await tx
          .insert(jobSkills)
          .values(skillIds.map(skillId => ({ jobId: job.id, skillId, isRequired: true })))
          .onConflictDoNothing()
        skillsLinked += skillIds.length
      }
    })

    processed++
  }

  logger.info('backfill-skills: done', { processed, skillsLinked, nextCursor, done })
  return NextResponse.json({
    processed,
    skillsLinked,
    candidates: candidates.length,
    next_cursor: nextCursor,
    done,
  })
}
