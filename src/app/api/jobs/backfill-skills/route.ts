import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { requireApiKey } from '@/lib/auth'
import { extractTags } from '@/lib/nlp-extract'
import { logger } from '@/lib/logger'
import { jobs, skills, jobSkills } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'

// POST /api/jobs/backfill-skills
// Re-runs NLP skill extraction on every job that has a description but no linked skills.
// Safe to call multiple times — uses INSERT ... ON CONFLICT DO NOTHING.
export async function POST(req: NextRequest) {
  if (!requireApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Find all jobs that have a description but zero linked skills
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

  logger.info('backfill-skills: candidates found', { count: candidates.length })

  let processed = 0
  let skillsAdded = 0

  for (const job of candidates) {
    if (!job.jobDescription) continue

    const { skills: extracted } = extractTags(job.jobDescription)
    if (extracted.length === 0) continue

    // Upsert each skill name → get id
    const skillRows = await Promise.all(
      extracted.map(name =>
        db
          .insert(skills)
          .values({ name })
          .onConflictDoNothing()
          .returning({ id: skills.id })
          .then(async rows => {
            if (rows[0]) return rows[0]
            const [existing] = await db
              .select({ id: skills.id })
              .from(skills)
              .where(eq(skills.name, name))
            return existing ?? null
          })
      )
    )

    const validSkillIds = skillRows.filter(Boolean) as { id: number }[]

    // Insert into job_skills (ON CONFLICT DO NOTHING — idempotent)
    if (validSkillIds.length > 0) {
      await db
        .insert(jobSkills)
        .values(validSkillIds.map(s => ({ jobId: job.id, skillId: s.id, isRequired: true })))
        .onConflictDoNothing()
      skillsAdded += validSkillIds.length
    }

    processed++
  }

  logger.info('backfill-skills: done', { processed, skillsAdded })
  return NextResponse.json({ processed, skillsAdded, candidates: candidates.length })
}
