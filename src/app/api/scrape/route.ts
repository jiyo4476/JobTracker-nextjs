import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { requireApiKey } from '@/lib/auth'
import { scrapePayloadSchema } from '@/lib/schemas'
import {
  companies, jobs, skills, software as softwareTable, keywords, certifications,
  jobSkills, jobSoftware, jobKeywords, jobCertifications,
} from '@/db/schema'
import { eq, and, ilike, gte, or, isNull } from 'drizzle-orm'

export async function POST(req: NextRequest) {
  if (!requireApiKey(req)) {
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

  const data = parsed.data

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
      return NextResponse.json({ action: 'updated', job_id: exactMatch[0].id })
    }

    // 4. Fuzzy cross-platform dedup: same company + same title, posted within 7 days OR no date.
    // Use date_found (always set) as the fallback window when date_posted is NULL.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const fuzzyMatch = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.companyId, companyId),
          ilike(jobs.jobTitle, data.job_title),
          or(
            isNull(jobs.datePosted),
            gte(jobs.datePosted, sevenDaysAgo)
          )
        )
      )
      .limit(1)

    if (fuzzyMatch.length > 0) {
      return NextResponse.json({ action: 'duplicate_skipped', job_id: fuzzyMatch[0].id })
    }

    // 5. Insert new job
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

    const jobId = newJob.id

    // 6. Upsert tags (skills, software, keywords, certifications).
    // One batch INSERT per tag type rather than one round-trip per tag name.
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
      upsertLookup(data.skills, skills),
      upsertLookup(data.software, softwareTable),
      upsertLookup(data.keywords, keywords),
      upsertLookup(data.certifications, certifications),
    ])

    await Promise.all([
      skillRows.length > 0 && db.insert(jobSkills).values(skillRows.map(r => ({ jobId, skillId: r.id }))).onConflictDoNothing(),
      softwareRows.length > 0 && db.insert(jobSoftware).values(softwareRows.map(r => ({ jobId, softwareId: r.id }))).onConflictDoNothing(),
      keywordRows.length > 0 && db.insert(jobKeywords).values(keywordRows.map(r => ({ jobId, keywordId: r.id }))).onConflictDoNothing(),
      certRows.length > 0 && db.insert(jobCertifications).values(certRows.map(r => ({ jobId, certificationId: r.id }))).onConflictDoNothing(),
    ])

    return NextResponse.json({ action: 'created', job_id: jobId }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/scrape]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
