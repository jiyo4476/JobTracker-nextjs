import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { requireApiKey } from '@/lib/auth'
import { scrapePayloadSchema } from '@/lib/schemas'
import { extractTags, mergeExtractedTags } from '@/lib/nlp-extract'
import { logger, serializeError } from '@/lib/logger'
import { escapeLikePattern } from '@/lib/db-utils'
import {
  companies, jobs, skills, software as softwareTable, keywords, certifications,
  jobSkills, jobSoftware, jobKeywords, jobCertifications,
} from '@/db/schema'
import { eq, and, ilike, sql } from 'drizzle-orm'

// Postgres unique_violation error code, surfaced as `.code` by the `postgres` driver.
const PG_UNIQUE_VIOLATION = '23505'

type Taxonomies = {
  skills: string[]
  software: string[]
  keywords: string[]
  certifications: string[]
}

async function attachTags(jobId: number, tags: Taxonomies) {
  async function upsertLookup(
    names: string[],
    lookupTable: typeof skills | typeof softwareTable | typeof keywords | typeof certifications,
  ) {
    if (names.length === 0) return []
    return db
      .insert(lookupTable)
      .values(names.map(name => ({ name })))
      .onConflictDoUpdate({ target: lookupTable.name, set: { name: lookupTable.name } })
      .returning({ id: lookupTable.id })
  }

  const [skillRows, softwareRows, keywordRows, certRows] = await Promise.all([
    upsertLookup(tags.skills, skills),
    upsertLookup(tags.software, softwareTable),
    upsertLookup(tags.keywords, keywords),
    upsertLookup(tags.certifications, certifications),
  ])

  await Promise.all([
    skillRows.length > 0 && db.insert(jobSkills).values(skillRows.map(r => ({ jobId, skillId: r.id }))).onConflictDoNothing(),
    softwareRows.length > 0 && db.insert(jobSoftware).values(softwareRows.map(r => ({ jobId, softwareId: r.id }))).onConflictDoNothing(),
    keywordRows.length > 0 && db.insert(jobKeywords).values(keywordRows.map(r => ({ jobId, keywordId: r.id }))).onConflictDoNothing(),
    certRows.length > 0 && db.insert(jobCertifications).values(certRows.map(r => ({ jobId, certificationId: r.id }))).onConflictDoNothing(),
  ])
}

export async function POST(req: NextRequest) {
  // External-only endpoint (Python scraper via OAuth2 bearer token) — the browser
  // UI never calls this directly, so the same-origin bypass must not apply here.
  if (!(await requireApiKey(req, { allowSameOrigin: false }))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = scrapePayloadSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  // Run the backend taxonomy pass even when the caller already extracted tags.
  // Caller values stay first; backend-only matches supplement local extraction.
  const extracted =
    parsed.data.job_description?.trim()
      ? extractTags(parsed.data.job_description)
      : null

  const mergedTags = extracted
    ? mergeExtractedTags(
        {
          skills: parsed.data.skills,
          software: parsed.data.software,
          keywords: parsed.data.keywords,
          certifications: parsed.data.certifications,
        },
        extracted,
      )
    : null

  if (extracted) {
    logger.debug('NLP taxonomy merge used', {
      platform: parsed.data.source_platform,
      merged: {
        skills: mergedTags?.skills.length ?? 0,
        software: mergedTags?.software.length ?? 0,
        keywords: mergedTags?.keywords.length ?? 0,
        certifications: mergedTags?.certifications.length ?? 0,
      },
    })
  }

  const data = {
    ...parsed.data,
    ...(mergedTags ?? {}),
  }

  try {
    // 1. Upsert company — use onConflictDoUpdate to guarantee a row is always returned
    const [company] = await db
      .insert(companies)
      .values({ name: data.company_name })
      .onConflictDoUpdate({ target: companies.name, set: { name: data.company_name } })
      .returning({ id: companies.id })

    if (!company) {
      return NextResponse.json({ error: 'Failed to resolve company' }, { status: 500 })
    }
    const companyId = company.id

    // 2. Compute annual equivalents for hourly roles
    let annualEquivalentMin: number | undefined
    let annualEquivalentMax: number | undefined
    if (data.salary_type === 'hourly') {
      if (data.hourly_rate_min != null) annualEquivalentMin = Math.round(data.hourly_rate_min * 2080 * 100)
      if (data.hourly_rate_max != null) annualEquivalentMax = Math.round(data.hourly_rate_max * 2080 * 100)
    } else if (data.salary_type === 'annual') {
      annualEquivalentMin = data.salary_min
      annualEquivalentMax = data.salary_max
    }

    // 3. Exact match: (external_job_id, source_platform)
    const exactMatch = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.externalJobId, data.external_job_id), eq(jobs.sourcePlatform, data.source_platform)))
      .limit(1)

    if (exactMatch.length > 0) {
      await db
        .update(jobs)
        .set({ lastScrapedAt: new Date(), isActive: true, updatedAt: new Date() })
        .where(eq(jobs.id, exactMatch[0].id))
      await attachTags(exactMatch[0].id, data)
      logger.info('scrape: job updated', { jobId: exactMatch[0].id, platform: data.source_platform })
      return NextResponse.json({ action: 'updated', job_id: exactMatch[0].id })
    }

    // 4. Fuzzy cross-platform dedup: same company + same title within the last 7 days.
    // Jobs with NULL date_posted fall back to date_found (set on every insert), so an
    // old undated posting ages out of the window instead of blocking new jobs forever.
    // Note: this check-then-insert has a residual race under concurrent scrapes of the
    // same brand-new job under different external_job_ids — there's no DB constraint
    // backstop for the fuzzy case (unlike the exact-match case below), so a very tight
    // race can still create a duplicate row. Low likelihood given the scraper runs
    // requests sequentially per platform; revisit with an advisory lock if it recurs.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const fuzzyMatch = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.companyId, companyId),
          ilike(jobs.jobTitle, escapeLikePattern(data.job_title)),
          sql`COALESCE(${jobs.datePosted}, ${jobs.dateFound}) >= ${sevenDaysAgo}`
        )
      )
      .limit(1)

    if (fuzzyMatch.length > 0) {
      logger.info('scrape: duplicate skipped', { existingJobId: fuzzyMatch[0].id, platform: data.source_platform })
      return NextResponse.json({ action: 'duplicate_skipped', job_id: fuzzyMatch[0].id })
    }

    // 5. Insert new job. A concurrent request for the same (external_job_id, source_platform)
    // that raced past the exact-match check above will hit the jobs_external_dedup unique
    // constraint here — catch that specifically and respond the same way the exact-match
    // branch would have, instead of falling through to a generic 500.
    let jobId: number
    try {
      const [newJob] = await db
        .insert(jobs)
        .values({
          companyId,
          jobTitle: data.job_title,
          jobLink: data.job_link,
          jobLocation: data.job_location,
          isRemote: data.is_remote,
          sourcePlatform: data.source_platform,
          externalJobId: data.external_job_id,
          jobType: data.job_type,
          experienceLevel: data.experience_level,
          jobDescription: data.job_description,
          salaryType: data.salary_type,
          salaryMin: data.salary_min,
          salaryMax: data.salary_max,
          hourlyRateMin: data.hourly_rate_min?.toString(),
          hourlyRateMax: data.hourly_rate_max?.toString(),
          annualEquivalentMin,
          annualEquivalentMax,
          salaryText: data.salary_text,
          postingMdPath: data.posting_md_path,
          securityClearanceReq: data.security_clearance_req,
          datePosted: data.date_posted,
          dateFound: new Date().toISOString().slice(0, 10),
          lastScrapedAt: new Date(),
        })
        .returning({ id: jobs.id })
      jobId = newJob.id
    } catch (err) {
      if ((err as { code?: string }).code === PG_UNIQUE_VIOLATION) {
        const [racedMatch] = await db
          .select({ id: jobs.id })
          .from(jobs)
          .where(and(eq(jobs.externalJobId, data.external_job_id), eq(jobs.sourcePlatform, data.source_platform)))
          .limit(1)
        if (racedMatch) {
          logger.info('scrape: duplicate skipped (race)', { existingJobId: racedMatch.id, platform: data.source_platform })
          return NextResponse.json({ action: 'duplicate_skipped', job_id: racedMatch.id })
        }
      }
      throw err
    }

    // 6. Upsert and attach all caller and backend taxonomy matches.
    await attachTags(jobId, data)

    logger.info('scrape: job created', { jobId, platform: data.source_platform, company: data.company_name })
    return NextResponse.json({ action: 'created', job_id: jobId }, { status: 201 })
  } catch (err) {
    logger.error('scrape webhook failed', serializeError(err))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
