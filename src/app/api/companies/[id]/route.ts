import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { requireApiKey } from '@/lib/auth'
import { companyPatchSchema } from '@/lib/schemas'
import { logger, serializeError } from '@/lib/logger'
import {
  certifications,
  companies,
  jobCertifications,
  jobKeywords,
  jobSkills,
  jobSoftware,
  jobs,
  keywords,
  skills,
  software,
} from '@/db/schema'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'

const demandConfigs = {
  skills: {
    junction: jobSkills,
    relationId: jobSkills.skillId,
    catalog: skills,
    catalogId: skills.id,
    name: skills.name,
    jobId: jobSkills.jobId,
  },
  software: {
    junction: jobSoftware,
    relationId: jobSoftware.softwareId,
    catalog: software,
    catalogId: software.id,
    name: software.name,
    jobId: jobSoftware.jobId,
  },
  certifications: {
    junction: jobCertifications,
    relationId: jobCertifications.certificationId,
    catalog: certifications,
    catalogId: certifications.id,
    name: certifications.name,
    jobId: jobCertifications.jobId,
  },
  keywords: {
    junction: jobKeywords,
    relationId: jobKeywords.keywordId,
    catalog: keywords,
    catalogId: keywords.id,
    name: keywords.name,
    jobId: jobKeywords.jobId,
  },
} as const

function companyDemandQuery(category: keyof typeof demandConfigs, companyId: number) {
  const config = demandConfigs[category]
  return db.execute(sql`
    SELECT ${config.catalogId} AS id,
           ${config.name} AS name,
           CAST(COUNT(DISTINCT ${config.jobId}) AS int) AS "jobCount"
    FROM ${config.junction}
    JOIN ${config.catalog} ON ${config.relationId} = ${config.catalogId}
    JOIN ${jobs} ON ${config.jobId} = ${jobs.id}
    WHERE ${jobs.companyId} = ${companyId}
      AND ${jobs.isActive} IS TRUE
      AND ${jobs.deletedAt} IS NULL
    GROUP BY ${config.catalogId}, ${config.name}
    ORDER BY "jobCount" DESC, ${config.name} ASC
  `)
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

  return NextResponse.json({
    ...company,
    jobs: companyJobs,
    taxonomyDemand: {
      activeJobCount: Number(activeJobCountRows[0]?.count ?? 0),
      skills: skillsDemand,
      software: softwareDemand,
      certifications: certificationsDemand,
      keywords: keywordsDemand,
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
