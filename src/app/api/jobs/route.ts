import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { requireApiKey } from '@/lib/auth'
import { manualJobSchema } from '@/lib/schemas'
import { logger, serializeError } from '@/lib/logger'
import { escapeLikePattern } from '@/lib/db-utils'
import {
  jobs,
  companies,
  jobSkills,
  jobSoftware,
  jobCertifications,
  jobKeywords,
} from '@/db/schema'
import { eq, and, ilike, or, gte, lte, count, desc, isNull, sql } from 'drizzle-orm'
import { parsePositiveIdFilter, taxonomyFilterParams } from '@/lib/taxonomy'
import {
  sourcePlatformEnum, jobTypeEnum, experienceLevelEnum, interviewStageEnum,
} from '@/lib/schemas'

export async function GET(req: NextRequest) {
  try {
    return await listJobs(req)
  } catch (err) {
    logger.error('GET /api/jobs failed', serializeError(err))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function listJobs(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '25')))
  const offset = (page - 1) * limit

  const filters = []

  const companyIdRaw = searchParams.get('company_id')
  if (companyIdRaw !== null) {
    const companyId = Number(companyIdRaw)
    if (!/^\d+$/.test(companyIdRaw) || !Number.isSafeInteger(companyId) || companyId <= 0) {
      return NextResponse.json(
        { error: 'Invalid company_id: expected a positive integer' },
        { status: 400 },
      )
    }
    filters.push(eq(jobs.companyId, companyId))
  }

  const stage = searchParams.get('stage')
  const stageParsed = interviewStageEnum.safeParse(stage)
  if (stage && stageParsed.success) filters.push(eq(jobs.interviewStage, stageParsed.data))

  const platform = searchParams.get('platform')
  const platformParsed = sourcePlatformEnum.safeParse(platform)
  if (platform && platformParsed.success) filters.push(eq(jobs.sourcePlatform, platformParsed.data))

  const jobType = searchParams.get('job_type')
  const jobTypeParsed = jobTypeEnum.safeParse(jobType)
  if (jobType && jobTypeParsed.success) filters.push(eq(jobs.jobType, jobTypeParsed.data))

  const expLevel = searchParams.get('experience_level')
  const expLevelParsed = experienceLevelEnum.safeParse(expLevel)
  if (expLevel && expLevelParsed.success) filters.push(eq(jobs.experienceLevel, expLevelParsed.data))

  const clearance = searchParams.get('security_clearance')
  if (clearance === 'true' || clearance === 'false') filters.push(eq(jobs.securityClearanceReq, clearance === 'true'))

  const isRemote = searchParams.get('is_remote')
  if (isRemote !== null) filters.push(eq(jobs.isRemote, isRemote === 'true'))

  // Default to active-only; pass ?is_active=false to include soft-deleted jobs
  const isActive = searchParams.get('is_active')
  const activeOnly = isActive === null ? true : isActive === 'true'
  filters.push(eq(jobs.isActive, activeOnly))
  if (activeOnly) filters.push(isNull(jobs.deletedAt))

  const salaryMinRaw = searchParams.get('salary_min')
  const salaryMinVal = salaryMinRaw ? parseInt(salaryMinRaw) : NaN
  if (!isNaN(salaryMinVal)) filters.push(gte(jobs.annualEquivalentMin, salaryMinVal))

  const salaryMaxRaw = searchParams.get('salary_max')
  const salaryMaxVal = salaryMaxRaw ? parseInt(salaryMaxRaw) : NaN
  if (!isNaN(salaryMaxVal)) filters.push(lte(jobs.annualEquivalentMax, salaryMaxVal))

  const priorityMinRaw = searchParams.get('priority_min')
  const priorityMinVal = priorityMinRaw ? parseInt(priorityMinRaw) : NaN
  // Drizzle infers `priority` from the smallint enum column; cast needed at TS level only
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!isNaN(priorityMinVal)) filters.push(gte(jobs.priority, priorityMinVal as any))

  const taxonomyFilters = [
    { param: taxonomyFilterParams.skills, junction: jobSkills, relationId: jobSkills.skillId },
    { param: taxonomyFilterParams.software, junction: jobSoftware, relationId: jobSoftware.softwareId },
    { param: taxonomyFilterParams.certifications, junction: jobCertifications, relationId: jobCertifications.certificationId },
    { param: taxonomyFilterParams.keywords, junction: jobKeywords, relationId: jobKeywords.keywordId },
  ] as const

  for (const taxonomyFilter of taxonomyFilters) {
    const parsed = parsePositiveIdFilter(searchParams, taxonomyFilter.param)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    if (parsed.ids.length === 0) continue

    // One EXISTS per populated category gives OR-within-category semantics through
    // ANY(...), while the outer AND keeps different categories independent.
    filters.push(sql`EXISTS (
      SELECT 1 FROM ${taxonomyFilter.junction}
      WHERE ${taxonomyFilter.junction.jobId} = ${jobs.id}
        AND ${taxonomyFilter.relationId} = ANY(ARRAY[${sql.join(parsed.ids.map(id => sql`${id}`), sql`, `)}]::int[])
    )`)
  }

  const q = searchParams.get('q')?.slice(0, 200)
  if (q) {
    // Escape LIKE special chars so user input doesn't accidentally match everything
    const escaped = escapeLikePattern(q)
    filters.push(
      or(
        ilike(jobs.jobTitle, `%${escaped}%`),
        ilike(companies.name, `%${escaped}%`),
        // Full-text match against job_description, backed by the jobs_description_fts_idx
        // GIN index. plainto_tsquery handles arbitrary user text safely — no LIKE-style
        // escaping needed.
        sql`to_tsvector('english', coalesce(${jobs.jobDescription}, '')) @@ plainto_tsquery('english', ${q})`
      )
    )
  }

  const where = filters.length > 0 ? and(...filters) : undefined

  logger.debug('GET /api/jobs', {
    page, limit, companyId: companyIdRaw, stage, platform, jobType, expLevel, clearance, isRemote,
    hasQuery: q != null && q.length > 0,
    queryLength: q != null ? q.length : undefined,
  })

  const [{ total }] = await db
    .select({ total: count() })
    .from(jobs)
    .leftJoin(companies, eq(jobs.companyId, companies.id))
    .where(where)

  const rows = await db
    .select({
      id: jobs.id,
      jobTitle: jobs.jobTitle,
      jobLink: jobs.jobLink,
      jobLocation: jobs.jobLocation,
      isRemote: jobs.isRemote,
      sourcePlatform: jobs.sourcePlatform,
      jobType: jobs.jobType,
      experienceLevel: jobs.experienceLevel,
      salaryMin: jobs.salaryMin,
      salaryMax: jobs.salaryMax,
      annualEquivalentMin: jobs.annualEquivalentMin,
      annualEquivalentMax: jobs.annualEquivalentMax,
      salaryText: jobs.salaryText,
      hasApplied: jobs.hasApplied,
      dateApplied: jobs.dateApplied,
      interviewStage: jobs.interviewStage,
      datePosted: jobs.datePosted,
      dateFound: jobs.dateFound,
      isActive: jobs.isActive,
      priority: jobs.priority,
      securityClearanceReq: jobs.securityClearanceReq,
      companyId: jobs.companyId,
      companyName: companies.name,
      createdAt: jobs.createdAt,
    })
    .from(jobs)
    .leftJoin(companies, eq(jobs.companyId, companies.id))
    .where(where)
    .orderBy(desc(jobs.dateFound))
    .limit(limit)
    .offset(offset)

  return NextResponse.json({
    jobs: rows,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  })
}

export async function POST(req: NextRequest) {
  if (!(await requireApiKey(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = manualJobSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const b = parsed.data
  try {
    const [newJob] = await db
      .insert(jobs)
      .values({
        jobTitle: b.job_title,
        jobLink: b.job_link,
        jobLocation: b.job_location,
        isRemote: b.is_remote,
        companyId: b.company_id,
        notes: b.notes,
        jobType: b.job_type,
        experienceLevel: b.experience_level,
        priority: b.priority,
        salaryText: b.salary_text,
        dateFound: new Date().toISOString().slice(0, 10),
      })
      .returning({ id: jobs.id })

    logger.info('job created manually', { jobId: newJob.id, title: b.job_title })
    return NextResponse.json({ job_id: newJob.id }, { status: 201 })
  } catch (err) {
    logger.error('POST /api/jobs failed', serializeError(err))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
