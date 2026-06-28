import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { requireApiKey } from '@/lib/auth'
import { extractTags } from '@/lib/nlp-extract'
import { logger } from '@/lib/logger'
import { jobs, skills, jobSkills } from '@/db/schema'
import { inArray, sql } from 'drizzle-orm'

// POST /api/jobs/backfill-skills
// Re-runs NLP skill extraction on every job that has a description but no linked skills.
// Safe to call multiple times — uses INSERT ... ON CONFLICT DO NOTHING.
// Accepts ?limit=N (default 100, max 500) to keep each call bounded.
export async function POST(req: NextRequest) {
  if (!requireApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const requestedLimit = Number(req.nextUrl.searchParams.get('limit') ?? '100')
  const limit =
    Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 500)
      : 100

  // Find jobs that have a description but zero linked skills
  const candidates = await db
    .select({ id: jobs.id, jobDescription: jobs.jobDescription })
    .from(jobs)
    .where(
      sql`${jobs.jobDescription} is not null
        and ${jobs.jobDescription} <> ''
        and not exists (
          select 1 from job_skills where job_skills.job_id = ${jobs.id}
        )`
    )
    .limit(limit)

  logger.info('backfill-skills: candidates found', { count: candidates.length, limit })

  let processed = 0
  let skillsAdded = 0

  for (const job of candidates) {
    if (!job.jobDescription) continue

    const { skills: extracted } = extractTags(job.jobDescription)
    if (extracted.length === 0) continue

    const uniqueSkillNames = [...new Set(extracted)]

    // Batch insert all skill names at once; get IDs for newly inserted rows
    const insertedSkills = await db
      .insert(skills)
      .values(uniqueSkillNames.map(name => ({ name })))
      .onConflictDoNothing()
      .returning({ id: skills.id, name: skills.name })

    // For names that conflicted (already existed), fetch their IDs in one query
    const insertedNames = new Set(insertedSkills.map(r => r.name))
    const missingNames = uniqueSkillNames.filter(name => !insertedNames.has(name))

    let existingSkills: { id: number; name: string }[] = []
    if (missingNames.length > 0) {
      existingSkills = await db
        .select({ id: skills.id, name: skills.name })
        .from(skills)
        .where(inArray(skills.name, missingNames))
    }

    const skillRows = [...insertedSkills, ...existingSkills]

    if (skillRows.length > 0) {
      await db
        .insert(jobSkills)
        .values(skillRows.map(s => ({ jobId: job.id, skillId: s.id, isRequired: true })))
        .onConflictDoNothing()
      skillsAdded += skillRows.length
    }

    processed++
  }

  logger.info('backfill-skills: done', { processed, skillsAdded })
  return NextResponse.json({ processed, skillsAdded, candidates: candidates.length })
}
