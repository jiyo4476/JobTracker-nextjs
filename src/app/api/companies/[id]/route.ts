import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { requireApiKey } from '@/lib/auth'
import { companyPatchSchema } from '@/lib/schemas'
import { logger, serializeError } from '@/lib/logger'
import { companies, jobs } from '@/db/schema'
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
  const { id } = await params
  const companyId = parseInt(id)
  if (isNaN(companyId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1)
  if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [companyJobs, activeJobCountRows, skillsDemand, softwareDemand, certificationsDemand, keywordsDemand] = await Promise.all([
    db
      .select({
        id: jobs.id,
        jobTitle: jobs.jobTitle,
        interviewStage: jobs.interviewStage,
        salaryMin: jobs.salaryMin,
        salaryMax: jobs.salaryMax,
        dateFound: jobs.dateFound,
      })
      .from(jobs)
      .where(and(eq(jobs.companyId, companyId), eq(jobs.isActive, true), isNull(jobs.deletedAt)))
      .orderBy(desc(jobs.dateFound))
      .limit(50),
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

  return NextResponse.json({
    ...company,
    jobs: companyJobs,
    taxonomyDemand: {
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
  if (!(await requireApiKey(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const companyId = parseInt(id)
  if (isNaN(companyId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const parsed = companyPatchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

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
