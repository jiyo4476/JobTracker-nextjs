import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { requireApiKey } from '@/lib/auth'
import { jobs, companies } from '@/db/schema'
import { eq, and, ilike, or, gte, lte, count } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '25')))
  const offset = (page - 1) * limit

  const filters = []

  const stage = searchParams.get('stage')
  if (stage) filters.push(eq(jobs.interviewStage, stage as Parameters<typeof eq>[1]))

  const platform = searchParams.get('platform')
  if (platform) filters.push(eq(jobs.sourcePlatform, platform as Parameters<typeof eq>[1]))

  const jobType = searchParams.get('job_type')
  if (jobType) filters.push(eq(jobs.jobType, jobType as Parameters<typeof eq>[1]))

  const expLevel = searchParams.get('experience_level')
  if (expLevel) filters.push(eq(jobs.experienceLevel, expLevel as Parameters<typeof eq>[1]))

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
  if (!isNaN(priorityMinVal)) filters.push(gte(jobs.priority, priorityMinVal as Parameters<typeof gte>[1]))

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

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.job_title || typeof body.job_title !== 'string') {
    return NextResponse.json({ error: 'job_title is required' }, { status: 400 })
  }

  const [newJob] = await db
    .insert(jobs)
    .values({
      jobTitle: body.job_title as string,
      jobLink: body.job_link as string | undefined,
      jobLocation: body.job_location as string | undefined,
      isRemote: body.is_remote as boolean | undefined,
      companyId: body.company_id as number | undefined,
      notes: body.notes as string | undefined,
      dateFound: new Date().toISOString().slice(0, 10),
    })
    .returning({ id: jobs.id })

  return NextResponse.json({ job_id: newJob.id }, { status: 201 })
}
