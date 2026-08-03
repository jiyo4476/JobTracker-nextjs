import { NextRequest, NextResponse } from 'next/server'
import { withUser } from '@/db/session'
import { privateJson, deprecatedAlias } from '@/lib/http'
import { resolveRequestUser } from '@/lib/resolved-user'
import { createCatalogJob } from '@/lib/admin-catalog-handlers'
import { logger, serializeError } from '@/lib/logger'
import { escapeLikePattern } from '@/lib/db-utils'
import {
  jobs,
  companies,
  userJobState,
  jobSkills,
  jobSoftware,
  jobCertifications,
  jobKeywords,
} from '@/db/schema'
import { eq, and, ilike, or, gte, lte, count, asc, desc, isNull, sql } from 'drizzle-orm'
import { parsePositiveIdFilter, taxonomyFilterParams } from '@/lib/taxonomy'
import {
  sourcePlatformEnum, jobTypeEnum, experienceLevelEnum, interviewStageEnum,
} from '@/lib/schemas'

const JOB_SCOPES = ['tracked', 'catalog', 'hidden'] as const
type JobScope = (typeof JOB_SCOPES)[number]

export async function GET(req: NextRequest) {
  // API-013: the jobs list is now owner-scoped. It joins the current user's
  // user_job_state overlay, so it requires a resolved interactive user (service
  // principals are rejected) and never caches per-user results.
  const auth = await resolveRequestUser(req)
  if (!auth.ok) return auth.response

  try {
    return await listJobs(req, auth.user.id)
  } catch (err) {
    logger.error('GET /api/jobs failed', serializeError(err))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function listJobs(req: NextRequest, userId: number) {
  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '25')))
  const offset = (page - 1) * limit

  const scopeParam = searchParams.get('scope') ?? 'tracked'
  if (!(JOB_SCOPES as readonly string[]).includes(scopeParam)) {
    return NextResponse.json(
      { error: 'Invalid scope: expected tracked, catalog, or hidden' },
      { status: 400 },
    )
  }
  const scope = scopeParam as JobScope

  const sortBy = searchParams.get('sort_by') ?? 'found'
  const sortOrder = searchParams.get('sort_order') ?? 'desc'
  // Stage and priority sorts read the owner's overlay; the rest stay on catalog tables.
  const sortColumns = {
    company: companies.name,
    role: jobs.jobTitle,
    stage: userJobState.interviewStage,
    location: jobs.jobLocation,
    salary: jobs.annualEquivalentMin,
    found: jobs.dateFound,
    priority: userJobState.priority,
    clearance: jobs.securityClearanceReq,
  } as const
  if (!Object.hasOwn(sortColumns, sortBy) || !['asc', 'desc'].includes(sortOrder)) {
    return NextResponse.json({ error: 'Invalid sort parameters' }, { status: 400 })
  }
  const sortColumn = sortColumns[sortBy as keyof typeof sortColumns]
  const sortDirection = sortOrder === 'asc' ? asc : desc

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

  // Stage/priority/applied filters are PERSONAL — they read user_job_state.
  const stage = searchParams.get('stage')
  const stageParsed = interviewStageEnum.safeParse(stage)
  if (stage && stageParsed.success) filters.push(eq(userJobState.interviewStage, stageParsed.data))

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

  const hasApplied = searchParams.get('has_applied')
  if (hasApplied === 'true' || hasApplied === 'false') {
    filters.push(eq(userJobState.hasApplied, hasApplied === 'true'))
  }

  // Default to active catalog jobs; pass ?is_active=false to include soft-deleted jobs.
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
  if (!isNaN(priorityMinVal)) filters.push(gte(userJobState.priority, priorityMinVal as any))

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

    filters.push(sql`EXISTS (
      SELECT 1 FROM ${taxonomyFilter.junction}
      WHERE ${taxonomyFilter.junction.jobId} = ${jobs.id}
        AND ${taxonomyFilter.relationId} = ANY(ARRAY[${sql.join(parsed.ids.map(id => sql`${id}`), sql`, `)}]::int[])
    )`)
  }

  const q = searchParams.get('q')?.slice(0, 200)
  if (q) {
    const escaped = escapeLikePattern(q)
    filters.push(
      or(
        ilike(jobs.jobTitle, `%${escaped}%`),
        ilike(companies.name, `%${escaped}%`),
        sql`to_tsvector('english', coalesce(${jobs.jobDescription}, '')) @@ plainto_tsquery('english', ${q})`
      )
    )
  }

  // Owner predicate for the state overlay: ALWAYS scoped to the resolved user, in the
  // JOIN condition so a LEFT JOIN cannot match another user's row. Defense-in-depth on
  // top of RLS (which withUser also sets).
  const ownerJoin = and(eq(userJobState.jobId, jobs.id), eq(userJobState.userId, userId))
  if (scope === 'hidden') {
    filters.push(eq(userJobState.isHidden, true))
  } else if (scope === 'tracked') {
    filters.push(eq(userJobState.isHidden, false))
  }

  const where = filters.length > 0 ? and(...filters) : undefined

  logger.debug('GET /api/jobs', {
    scope, page, limit, companyId: companyIdRaw, stage, platform, jobType, expLevel,
    clearance, isRemote, hasQuery: q != null && q.length > 0,
    queryLength: q != null ? q.length : undefined,
  })

  return withUser(userId, async (tx) => {
    const applyStateJoin = <T extends { leftJoin: unknown; innerJoin: unknown }>(query: T) => {
      const anyQuery = query as unknown as {
        leftJoin: (...args: unknown[]) => T
        innerJoin: (...args: unknown[]) => T
      }
      return scope === 'catalog'
        ? anyQuery.leftJoin(userJobState, ownerJoin)
        : anyQuery.innerJoin(userJobState, ownerJoin)
    }

    const countQuery = applyStateJoin(
      tx.select({ total: count() }).from(jobs).leftJoin(companies, eq(jobs.companyId, companies.id)),
    ).where(where)
    const [{ total }] = await countQuery

    const rowsQuery = applyStateJoin(
      tx
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
          salaryType: jobs.salaryType,
          hourlyRateMin: jobs.hourlyRateMin,
          hourlyRateMax: jobs.hourlyRateMax,
          annualEquivalentMin: jobs.annualEquivalentMin,
          annualEquivalentMax: jobs.annualEquivalentMax,
          salaryText: jobs.salaryText,
          datePosted: jobs.datePosted,
          dateFound: jobs.dateFound,
          isActive: jobs.isActive,
          securityClearanceReq: jobs.securityClearanceReq,
          companyId: jobs.companyId,
          companyName: companies.name,
          createdAt: jobs.createdAt,
          // Transitional flattened personal fields (from user_job_state).
          stateUserId: userJobState.userId,
          priority: userJobState.priority,
          interviewStage: userJobState.interviewStage,
          hasApplied: userJobState.hasApplied,
          dateApplied: userJobState.dateApplied,
          heardBack: userJobState.heardBack,
          isHidden: userJobState.isHidden,
        })
        .from(jobs)
        .leftJoin(companies, eq(jobs.companyId, companies.id)),
    )
      .where(where)
      .orderBy(sql`${sortDirection(sortColumn)} nulls last`, desc(jobs.id))
      .limit(limit)
      .offset(offset)

    const rows = await rowsQuery

    const jobsOut = rows.map(({ stateUserId, isHidden, ...rest }) => ({
      ...rest,
      isTracked: stateUserId !== null && stateUserId !== undefined,
      isHidden: isHidden ?? false,
    }))

    return privateJson({
      jobs: jobsOut,
      scope,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  })
}

// API-013 slice 1: catalog creation is now admin-only. This legacy path is a DEPRECATED
// admin-gated alias of the canonical `POST /api/admin/jobs`. Ordinary users no longer
// create catalog jobs here; they add an existing catalog job to their tracker via
// `PUT /api/jobs/[id]/state`.
export const POST = deprecatedAlias(createCatalogJob, '/api/admin/jobs')
