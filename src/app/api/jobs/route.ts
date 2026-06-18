import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { requireApiKey } from '@/lib/auth'
import { manualJobSchema } from '@/lib/schemas'
import { jobs, companies, jobSkills } from '@/db/schema'
import { eq, and, ilike, or, gte, lte, count, desc, inArray } from 'drizzle-orm'
import {
  sourcePlatformEnum, jobTypeEnum, experienceLevelEnum, interviewStageEnum,
} from '@/lib/schemas'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '25')))
  const offset = (page - 1) * limit

  const filters = []

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

  const isRemote = searchParams.get('is_remote')
  if (isRemote !== null) filters.push(eq(jobs.isRemote, isRemote === 'true'))

  const isActive = searchParams.get('is_active')
  if (isActive !== null) filters.push(eq(jobs.isActive, isActive === 'true'))

  const salaryMinRaw = searchParams.get('salary_min')
  const salaryMinVal = salaryMinRaw ? parseInt(salaryMinRaw) : NaN
  if (!isNaN(salaryMinVal)) filters.push(gte(jobs.annualEquivalentMin, salaryMinVal))

  const salaryMaxRaw = searchParams.get('salary_max')
  const salaryMaxVal = salaryMaxRaw ? parseInt(salaryMaxRaw) : NaN
  if (!isNaN(salaryMaxVal)) filters.push(lte(jobs.annualEquivalentMax, salaryMaxVal))

  const priorityMinRaw = searchParams.get('priority_min')
  const priorityMinVal = priorityMinRaw ? parseInt(priorityMinRaw) : NaN
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!isNaN(priorityMinVal)) filters.push(gte(jobs.priority, priorityMinVal as any))

  const skillIdsRaw = searchParams.get('skill_ids')
  if (skillIdsRaw) {
    const skillIds = skillIdsRaw.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n))
    if (skillIds.length > 0) {
      filters.push(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inArray(jobs.id, db.select({ id: jobSkills.jobId }).from(jobSkills).where(inArray(jobSkills.skillId, skillIds))) as any
      )
    }
  }

  const q = searchParams.get('q')?.slice(0, 200)
  if (q) {
    // Escape LIKE special chars so user input doesn't accidentally match everything
    const escaped = q.replace(/[%_\\]/g, (c) => `\\${c}`)
    filters.push(
      or(
        ilike(jobs.jobTitle, `%${escaped}%`),
        ilike(companies.name, `%${escaped}%`)
      )
    )
  }

  const where = filters.length > 0 ? and(...filters) : undefined

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
  if (!requireApiKey(req)) {
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
      dateFound: new Date().toISOString().slice(0, 10),
    })
    .returning({ id: jobs.id })

  return NextResponse.json({ job_id: newJob.id }, { status: 201 })
}
