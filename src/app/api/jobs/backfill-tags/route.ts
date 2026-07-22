import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { requireAuthentication } from '@/lib/auth'
import { extractTags } from '@/lib/nlp-extract'
import { logger, serializeError } from '@/lib/logger'
import {
  jobs, skills, software as softwareTable, certifications,
  jobSkills, jobSoftware, jobCertifications,
} from '@/db/schema'
import { inArray, sql } from 'drizzle-orm'

// POST /api/jobs/backfill-tags
// Cursor-bounded, idempotent taxonomy backfill. Re-runs NLP extraction on every
// job with a non-empty description and additively attaches skills, software,
// and certifications. Existing links are never removed — legacy job_skills rows
// may be manual or referenced by user_skills, so cleanup of misclassified links
// is a separate, reviewed step (see TAXONOMY-001).
//
// Params:
//   ?limit=N     batch size (default 100, max 500)
//   ?cursor=ID   resume after this job id (exclusive; default 0)
//   ?dry_run=1   extract and report without writing anything (sample capped
//                at the first 20 jobs of the batch; extracted counts cover all)
//
// Response reports per-category net-new link counts (junction rows actually
// inserted), plus next_cursor/done for pagination. Safe to call repeatedly —
// all inserts use ON CONFLICT DO NOTHING.
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
type LookupTable = typeof skills | typeof softwareTable | typeof certifications

async function resolveLookupIds(
  tx: DbTransaction,
  table: LookupTable,
  names: string[],
): Promise<number[]> {
  if (names.length === 0) return []

  const inserted = await tx
    .insert(table)
    .values(names.map(name => ({ name })))
    .onConflictDoNothing()
    .returning({ id: table.id, name: table.name })

  const insertedNames = new Set(inserted.map(r => r.name))
  const missingNames = names.filter(name => !insertedNames.has(name))

  let existing: { id: number }[] = []
  if (missingNames.length > 0) {
    existing = await tx
      .select({ id: table.id })
      .from(table)
      .where(inArray(table.name, missingNames))
  }

  return [...inserted.map(r => r.id), ...existing.map(r => r.id)]
}

export async function POST(req: NextRequest) {
  if (!(await requireAuthentication(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const requestedLimit = Number(req.nextUrl.searchParams.get('limit') ?? '100')
  const limit =
    Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 500)
      : 100

  const requestedCursor = Number(req.nextUrl.searchParams.get('cursor') ?? '0')
  const cursor = Number.isFinite(requestedCursor) && requestedCursor > 0 ? requestedCursor : 0

  const dryRunParam = req.nextUrl.searchParams.get('dry_run')
  const dryRun = dryRunParam === '1' || dryRunParam === 'true'

  const candidates = await db
    .select({ id: jobs.id, jobDescription: jobs.jobDescription })
    .from(jobs)
    .where(
      sql`${jobs.id} > ${cursor}
        and ${jobs.jobDescription} is not null
        and ${jobs.jobDescription} <> ''`
    )
    .orderBy(jobs.id)
    .limit(limit)

  const done = candidates.length < limit

  logger.info('backfill-tags: candidates found', { count: candidates.length, limit, cursor, dryRun })

  if (dryRun) {
    // Report what would be attached so misclassified legacy links can be
    // reviewed against sampled descriptions before any cleanup.
    const extracted = { skills: 0, software: 0, certifications: 0 }
    const sample: Array<{
      job_id: number
      skills: string[]
      software: string[]
      certifications: string[]
    }> = []

    for (const job of candidates) {
      if (!job.jobDescription) continue
      const tags = extractTags(job.jobDescription)
      extracted.skills += tags.skills.length
      extracted.software += tags.software.length
      extracted.certifications += tags.certifications.length
      if (sample.length < 20) {
        sample.push({
          job_id: job.id,
          skills: tags.skills,
          software: tags.software,
          certifications: tags.certifications,
        })
      }
    }

    const nextCursor = candidates.length > 0 ? candidates[candidates.length - 1].id : cursor
    return NextResponse.json({
      dry_run: true,
      candidates: candidates.length,
      extracted,
      sample,
      next_cursor: nextCursor,
      done,
    })
  }

  const linked = { skills: 0, software: 0, certifications: 0 }
  let processed = 0
  let nextCursor = cursor

  for (const job of candidates) {
    if (!job.jobDescription) continue
    const tags = extractTags(job.jobDescription)

    try {
      // Per-job transaction: a mid-batch failure never leaves a job with
      // partial links, and the returned next_cursor lets the caller resume
      // at the failed job.
      const counts = await db.transaction(async tx => {
        const [skillIds, softwareIds, certIds] = [
          await resolveLookupIds(tx, skills, tags.skills),
          await resolveLookupIds(tx, softwareTable, tags.software),
          await resolveLookupIds(tx, certifications, tags.certifications),
        ]

        const result = { skills: 0, software: 0, certifications: 0 }

        if (skillIds.length > 0) {
          const rows = await tx
            .insert(jobSkills)
            .values(skillIds.map(skillId => ({ jobId: job.id, skillId })))
            .onConflictDoNothing()
            .returning({ jobId: jobSkills.jobId })
          result.skills = rows.length
        }
        if (softwareIds.length > 0) {
          const rows = await tx
            .insert(jobSoftware)
            .values(softwareIds.map(softwareId => ({ jobId: job.id, softwareId })))
            .onConflictDoNothing()
            .returning({ jobId: jobSoftware.jobId })
          result.software = rows.length
        }
        if (certIds.length > 0) {
          const rows = await tx
            .insert(jobCertifications)
            .values(certIds.map(certificationId => ({ jobId: job.id, certificationId })))
            .onConflictDoNothing()
            .returning({ jobId: jobCertifications.jobId })
          result.certifications = rows.length
        }

        return result
      })

      linked.skills += counts.skills
      linked.software += counts.software
      linked.certifications += counts.certifications
    } catch (err) {
      logger.error('backfill-tags: job failed', { jobId: job.id, ...serializeError(err) })
      return NextResponse.json(
        {
          error: 'Backfill failed',
          failed_job_id: job.id,
          processed,
          linked,
          next_cursor: nextCursor,
          done: false,
        },
        { status: 500 },
      )
    }

    processed++
    nextCursor = job.id
  }

  logger.info('backfill-tags: done', { processed, linked, nextCursor, done })
  return NextResponse.json({
    processed,
    candidates: candidates.length,
    linked,
    next_cursor: nextCursor,
    done,
  })
}
