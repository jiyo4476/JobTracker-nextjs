import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { withUser } from '@/db/session'
import { requireAuth, readJsonBody, privateJson } from '@/lib/http'
import { resolveRequestUser } from '@/lib/resolved-user'
import { companyPatchSchema } from '@/lib/schemas'
import { logger, serializeError } from '@/lib/logger'
import { companies, jobs, userJobState } from '@/db/schema'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import {
  buildCompanyDemandQuery,
  COMPANY_DEMAND_LIMIT,
  type CompanyDemandCategory,
} from '@/lib/company-taxonomy-demand'

type DemandRow = {
  id: number
  name: string
  jobCount: number
}

function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  if (result && typeof result === 'object' && 'rows' in result) {
    const rows = (result as { rows?: unknown }).rows
    if (Array.isArray(rows)) return rows as T[]
  }
  return []
}

function companyDemandQuery(
  category: CompanyDemandCategory,
  companyId: number,
) {
  return db.execute(buildCompanyDemandQuery(category, companyId))
}

function summarizeDemand(result: unknown) {
  const rows = resultRows<DemandRow>(result)
  return {
    items: rows.slice(0, COMPANY_DEMAND_LIMIT),
    truncated: rows.length > COMPANY_DEMAND_LIMIT,
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // API-013 (slice 2): company detail exposes global company/catalog facts, but each
  // listed job's interview stage and the applied/linked-tracked counts are PERSONAL —
  // they join only the caller's user_job_state. So the route now requires a resolved
  // interactive user and returns private/no-store.
  const auth = await resolveRequestUser(req)
  if (!auth.ok) return auth.response
  const userId = auth.user.id

  const { id } = await params
  const companyId = parseInt(id)
  if (isNaN(companyId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1)
  if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Owner predicate for the personal overlay: pin user_id to the caller in the JOIN
  // condition, so this LEFT JOIN can never match another user's state row.
  const ownerJoin = and(eq(userJobState.jobId, jobs.id), eq(userJobState.userId, userId))

  const { companyJobs, trackedJobCount } = await withUser(userId, async (tx) => {
    const [rows, [tracked]] = await Promise.all([
      tx
        .select({
          id: jobs.id,
          jobTitle: jobs.jobTitle,
          // Interview stage is the caller's own state (null when the caller does not
          // track this job) — never the global legacy jobs column.
          interviewStage: userJobState.interviewStage,
          stateUserId: userJobState.userId,
          salaryMin: jobs.salaryMin,
          salaryMax: jobs.salaryMax,
          dateFound: jobs.dateFound,
        })
        .from(jobs)
        .leftJoin(userJobState, and(ownerJoin, eq(userJobState.isHidden, false)))
        .where(and(eq(jobs.companyId, companyId), eq(jobs.isActive, true), isNull(jobs.deletedAt)))
        .orderBy(desc(jobs.dateFound))
        .limit(50),
      tx
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(userJobState)
        .innerJoin(jobs, eq(userJobState.jobId, jobs.id))
        .where(and(
          eq(userJobState.userId, userId),
          eq(userJobState.isHidden, false),
          eq(jobs.companyId, companyId),
          eq(jobs.isActive, true),
          isNull(jobs.deletedAt),
        )),
    ])

    return {
      companyJobs: rows.map(({ stateUserId, ...rest }) => ({
        ...rest,
        isTracked: stateUserId !== null && stateUserId !== undefined,
      })),
      trackedJobCount: Number(tracked?.count ?? 0),
    }
  })

  const [activeJobCountRows, skillsDemand, softwareDemand, certificationsDemand, keywordsDemand] = await Promise.all([
    db.execute(sql`
      SELECT CAST(COUNT(DISTINCT ${jobs.id}) AS int) AS count
      FROM ${jobs}
      WHERE ${jobs.companyId} = ${companyId}
        AND ${jobs.isActive} IS TRUE
        AND ${jobs.deletedAt} IS NULL
    `),
    companyDemandQuery('skills', companyId),
    companyDemandQuery('software', companyId),
    companyDemandQuery('certifications', companyId),
    companyDemandQuery('keywords', companyId),
  ])

  const demand = {
    skills: summarizeDemand(skillsDemand),
    software: summarizeDemand(softwareDemand),
    certifications: summarizeDemand(certificationsDemand),
    keywords: summarizeDemand(keywordsDemand),
  }

  return privateJson({
    ...company,
    jobs: companyJobs,
    // PERSONAL: how many of this company's active jobs the caller currently tracks.
    trackedJobCount,
    taxonomyDemand: {
      // CATALOG supply metric: total active catalog jobs at this company (global).
      activeJobCount: Number(resultRows<{ count: number }>(activeJobCountRows)[0]?.count ?? 0),
      skills: demand.skills.items,
      software: demand.software.items,
      certifications: demand.certifications.items,
      keywords: demand.keywords.items,
      truncated: {
        skills: demand.skills.truncated,
        software: demand.software.truncated,
        certifications: demand.certifications.truncated,
        keywords: demand.keywords.truncated,
      },
    },
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth(req)
  if (denied) return denied

  const { id } = await params
  const companyId = parseInt(id)
  if (isNaN(companyId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const parsed = await readJsonBody(req, companyPatchSchema)
  if (!parsed.ok) return parsed.response

  const d = parsed.data
  try {
    await db.update(companies).set({
      ...(d.name !== undefined && { name: d.name }),
      ...(d.website !== undefined && { website: d.website }),
      ...(d.industry !== undefined && { industry: d.industry }),
      ...(d.size_range !== undefined && { sizeRange: d.size_range }),
      ...(d.hq_location !== undefined && { hqLocation: d.hq_location }),
      ...(d.glassdoor_url !== undefined && { glassdoorUrl: d.glassdoor_url }),
      ...(d.linkedin_url !== undefined && { linkedinUrl: d.linkedin_url }),
      ...(d.notes !== undefined && { notes: d.notes }),
    }).where(eq(companies.id, companyId))
  } catch (err) {
    logger.error('PATCH /api/companies/[id] failed', { companyId, ...serializeError(err) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  logger.info('company updated', { companyId })
  return NextResponse.json({ success: true })
}
