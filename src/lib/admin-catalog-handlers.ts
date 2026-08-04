import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { db } from '@/db'
import { readJsonBody } from '@/lib/http'
import { resolveAdminUser } from '@/lib/admin'
import { upsertLookupIds } from '@/lib/db-utils'
import { hourlyToAnnualEquivalentCents } from '@/lib/salary-format'
import {
  jobCatalogCreateSchema,
  jobCatalogPatchSchema,
  jobSalaryPatchSchema,
  jobTagsPatchSchema,
} from '@/lib/schemas'
import { logger, serializeError } from '@/lib/logger'
import {
  certifications,
  jobs,
  jobCertifications,
  jobKeywords,
  jobSkills,
  jobSoftware,
  keywords,
  skills,
  software as softwareTable,
} from '@/db/schema'
import { eq } from 'drizzle-orm'

/**
 * API-013 slice 1 — shared implementations for admin catalog mutations.
 *
 * These are the single source of truth for creating/updating/deleting the shared job
 * catalog. They are mounted at the canonical `/api/admin/jobs[/id]` namespace and, during
 * the cutover, re-used behind a deprecation header at the legacy `/api/jobs[/id]` paths.
 *
 * Every handler starts with `resolveAdminUser`, which rejects unauthenticated callers
 * (401), service principals / deactivated accounts and non-admins (403, non-disclosing).
 * The admin claim comes only from the verified token — never the body/header/query/URL.
 */

type IdContext = { params: Promise<{ id: string }> }

function parseJobId(id: string): number | null {
  if (!/^[1-9]\d*$/.test(id)) return null
  const jobId = Number(id)
  return Number.isSafeInteger(jobId) ? jobId : null
}

const invalidId = () => NextResponse.json({ error: 'Invalid id' }, { status: 400 })
const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 })

export async function createCatalogJob(req: NextRequest): Promise<NextResponse> {
  const auth = await resolveAdminUser(req)
  if (!auth.ok) return auth.response

  const parsed = await readJsonBody(req, jobCatalogCreateSchema)
  if (!parsed.ok) return parsed.response

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
        jobType: b.job_type,
        experienceLevel: b.experience_level,
        salaryText: b.salary_text,
        dateFound: new Date().toISOString().slice(0, 10),
      })
      .returning({ id: jobs.id })

    logger.info('catalog job created', { jobId: newJob.id, title: b.job_title })
    return NextResponse.json({ job_id: newJob.id }, { status: 201 })
  } catch (err) {
    logger.error('POST catalog job failed', serializeError(err))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function patchCatalogJob(req: NextRequest, ctx: IdContext): Promise<NextResponse> {
  const auth = await resolveAdminUser(req)
  if (!auth.ok) return auth.response

  const { id } = await ctx.params
  const jobId = parseJobId(id)
  if (jobId === null) return invalidId()

  const parsed = await readJsonBody(req, jobCatalogPatchSchema)
  if (!parsed.ok) return parsed.response
  const d = parsed.data

  // Recompute annual equivalents when salary fields change. If salary_type isn't in the
  // patch, read it from the DB so we don't corrupt annual_equivalent_* when only a rate
  // field is updated.
  let annualEquivalentMin: number | undefined
  let annualEquivalentMax: number | undefined
  const salaryFieldsChanged =
    d.salary_type !== undefined ||
    d.hourly_rate_min !== undefined ||
    d.hourly_rate_max !== undefined ||
    d.salary_min !== undefined ||
    d.salary_max !== undefined

  if (salaryFieldsChanged) {
    let salaryType = d.salary_type
    if (salaryType === undefined) {
      const [cur] = await db
        .select({ salaryType: jobs.salaryType })
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .limit(1)
      salaryType = cur?.salaryType ?? undefined
    }
    if (salaryType === 'hourly') {
      if (d.hourly_rate_min !== undefined) annualEquivalentMin = hourlyToAnnualEquivalentCents(d.hourly_rate_min)
      if (d.hourly_rate_max !== undefined) annualEquivalentMax = hourlyToAnnualEquivalentCents(d.hourly_rate_max)
    } else if (salaryType === 'annual') {
      if (d.salary_min !== undefined) annualEquivalentMin = d.salary_min
      if (d.salary_max !== undefined) annualEquivalentMax = d.salary_max
    }
  }

  try {
    const result = await db.update(jobs).set({
      ...(d.job_title !== undefined && { jobTitle: d.job_title }),
      ...(d.company_id !== undefined && { companyId: d.company_id }),
      ...(d.job_location !== undefined && { jobLocation: d.job_location }),
      ...(d.is_remote !== undefined && { isRemote: d.is_remote }),
      ...(d.job_description !== undefined && { jobDescription: d.job_description }),
      ...(d.date_posted !== undefined && { datePosted: d.date_posted || null }),
      ...(d.salary_text !== undefined && { salaryText: d.salary_text }),
      ...(d.salary_type !== undefined && { salaryType: d.salary_type }),
      ...(d.salary_min !== undefined && { salaryMin: d.salary_min }),
      ...(d.salary_max !== undefined && { salaryMax: d.salary_max }),
      ...(d.hourly_rate_min !== undefined && { hourlyRateMin: d.hourly_rate_min.toString() }),
      ...(d.hourly_rate_max !== undefined && { hourlyRateMax: d.hourly_rate_max.toString() }),
      ...(d.job_type !== undefined && { jobType: d.job_type }),
      ...(d.experience_level !== undefined && { experienceLevel: d.experience_level }),
      ...(d.security_clearance_req !== undefined && { securityClearanceReq: d.security_clearance_req }),
      ...(d.is_active !== undefined && { isActive: d.is_active }),
      ...(d.is_active === true && { deletedAt: null }),
      ...(d.application_deadline !== undefined && { applicationDeadline: d.application_deadline || null }),
      ...(annualEquivalentMin !== undefined && { annualEquivalentMin }),
      ...(annualEquivalentMax !== undefined && { annualEquivalentMax }),
      updatedAt: new Date(),
    }).where(eq(jobs.id, jobId)).returning({ id: jobs.id })

    if (result.length === 0) return notFound()
    logger.info('catalog job updated', { jobId, fields: Object.keys(d) })
    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error('PATCH catalog job failed', { jobId, ...serializeError(err) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function deleteCatalogJob(req: NextRequest, ctx: IdContext): Promise<NextResponse> {
  const auth = await resolveAdminUser(req)
  if (!auth.ok) return auth.response

  const { id } = await ctx.params
  const jobId = parseJobId(id)
  if (jobId === null) return invalidId()

  let result: { id: number }[]
  try {
    result = await db
      .update(jobs)
      .set({ isActive: false, deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(jobs.id, jobId))
      .returning({ id: jobs.id })
  } catch (err) {
    logger.error('DELETE catalog job failed', { jobId, ...serializeError(err) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  if (result.length === 0) return notFound()
  logger.info('catalog job soft-deleted', { jobId })
  return NextResponse.json({ success: true })
}

export async function patchCatalogJobSalary(req: NextRequest, ctx: IdContext): Promise<NextResponse> {
  const auth = await resolveAdminUser(req)
  if (!auth.ok) return auth.response

  const { id } = await ctx.params
  const jobId = parseJobId(id)
  if (jobId === null) return invalidId()

  const parsed = await readJsonBody(req, jobSalaryPatchSchema)
  if (!parsed.ok) return parsed.response

  const d = parsed.data
  // salary_min/salary_max arrive as annual-equivalent cents, matching jobCatalogPatchSchema.
  const salaryMinCents = d.salary_min
  const salaryMaxCents = d.salary_max
  const hourlyRateMin = d.hourly_rate_min
  const hourlyRateMax = d.hourly_rate_max
  const annualRangeProvided = salaryMinCents !== undefined || salaryMaxCents !== undefined
  const hourlyRangeProvided = hourlyRateMin !== undefined || hourlyRateMax !== undefined

  try {
    let nextSalaryType = d.salary_type
    if (nextSalaryType === undefined) {
      if (hourlyRangeProvided) nextSalaryType = 'hourly'
      else if (annualRangeProvided) nextSalaryType = 'annual'
    }

    const annualEquivalentMin =
      nextSalaryType === 'hourly'
        ? hourlyToAnnualEquivalentCents(hourlyRateMin)
        : salaryMinCents
    const annualEquivalentMax =
      nextSalaryType === 'hourly'
        ? hourlyToAnnualEquivalentCents(hourlyRateMax)
        : salaryMaxCents

    const [updated] = await db
      .update(jobs)
      .set({
        ...(nextSalaryType !== undefined && { salaryType: nextSalaryType }),
        ...(salaryMinCents !== undefined && { salaryMin: salaryMinCents }),
        ...(salaryMaxCents !== undefined && { salaryMax: salaryMaxCents }),
        ...(hourlyRateMin !== undefined && { hourlyRateMin: hourlyRateMin === null ? null : hourlyRateMin.toString() }),
        ...(hourlyRateMax !== undefined && { hourlyRateMax: hourlyRateMax === null ? null : hourlyRateMax.toString() }),
        ...(annualEquivalentMin !== undefined && { annualEquivalentMin }),
        ...(annualEquivalentMax !== undefined && { annualEquivalentMax }),
        ...(nextSalaryType === 'annual' && annualRangeProvided && { hourlyRateMin: null, hourlyRateMax: null }),
        ...(nextSalaryType === 'hourly' && hourlyRangeProvided && { salaryMin: null, salaryMax: null }),
        ...(d.salary_type === null && {
          salaryMin: null,
          salaryMax: null,
          hourlyRateMin: null,
          hourlyRateMax: null,
          annualEquivalentMin: null,
          annualEquivalentMax: null,
        }),
        ...(d.salary_currency !== undefined && { salaryCurrency: d.salary_currency }),
        ...(d.salary_text !== undefined && { salaryText: d.salary_text }),
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId))
      .returning({
        id: jobs.id,
        salaryType: jobs.salaryType,
        salaryMin: jobs.salaryMin,
        salaryMax: jobs.salaryMax,
        hourlyRateMin: jobs.hourlyRateMin,
        hourlyRateMax: jobs.hourlyRateMax,
        annualEquivalentMin: jobs.annualEquivalentMin,
        annualEquivalentMax: jobs.annualEquivalentMax,
        salaryCurrency: jobs.salaryCurrency,
        salaryText: jobs.salaryText,
      })

    if (!updated) return notFound()
    logger.info('catalog job salary updated', { jobId })
    return NextResponse.json(updated)
  } catch (err) {
    logger.error('PATCH catalog job salary failed', { jobId, ...serializeError(err) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

type TagKey = 'skills' | 'software' | 'keywords' | 'certifications'

function uniqueNames(values: string[] | undefined) {
  if (!values) return undefined
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)))
}

async function readJobTags(jobId: number) {
  const [skillRows, softwareRows, keywordRows, certificationRows] = await Promise.all([
    db.select({ id: skills.id, name: skills.name }).from(skills).innerJoin(jobSkills, eq(skills.id, jobSkills.skillId)).where(eq(jobSkills.jobId, jobId)),
    db.select({ id: softwareTable.id, name: softwareTable.name }).from(softwareTable).innerJoin(jobSoftware, eq(softwareTable.id, jobSoftware.softwareId)).where(eq(jobSoftware.jobId, jobId)),
    db.select({ id: keywords.id, name: keywords.name }).from(keywords).innerJoin(jobKeywords, eq(keywords.id, jobKeywords.keywordId)).where(eq(jobKeywords.jobId, jobId)),
    db.select({ id: certifications.id, name: certifications.name }).from(certifications).innerJoin(jobCertifications, eq(certifications.id, jobCertifications.certificationId)).where(eq(jobCertifications.jobId, jobId)),
  ])

  return {
    skills: skillRows,
    software: softwareRows,
    keywords: keywordRows,
    certifications: certificationRows,
    counts: {
      skills: skillRows.length,
      software: softwareRows.length,
      keywords: keywordRows.length,
      certifications: certificationRows.length,
    },
  }
}

export async function patchCatalogJobTags(req: NextRequest, ctx: IdContext): Promise<NextResponse> {
  const auth = await resolveAdminUser(req)
  if (!auth.ok) return auth.response

  const { id } = await ctx.params
  const jobId = parseJobId(id)
  if (jobId === null) return invalidId()

  const parsed = await readJsonBody(req, jobTagsPatchSchema)
  if (!parsed.ok) return parsed.response

  const [job] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, jobId)).limit(1)
  if (!job) return notFound()

  const requested: Record<TagKey, string[] | undefined> = {
    skills: uniqueNames(parsed.data.skills),
    software: uniqueNames(parsed.data.software),
    keywords: uniqueNames(parsed.data.keywords),
    certifications: uniqueNames(parsed.data.certifications),
  }

  // Resolve every requested tag name to its lookup id up front (outside the transaction),
  // using the shared upsert helper so create/conflict semantics match scrape and backfill.
  const lookupIds: Partial<Record<TagKey, number[]>> = {}
  if (requested.skills) lookupIds.skills = await upsertLookupIds(db, skills, requested.skills)
  if (requested.software) lookupIds.software = await upsertLookupIds(db, softwareTable, requested.software)
  if (requested.keywords) lookupIds.keywords = await upsertLookupIds(db, keywords, requested.keywords)
  if (requested.certifications) lookupIds.certifications = await upsertLookupIds(db, certifications, requested.certifications)

  try {
    await db.transaction(async tx => {
      if (requested.skills) {
        await tx.delete(jobSkills).where(eq(jobSkills.jobId, jobId))
        const ids = lookupIds.skills ?? []
        if (ids.length > 0) await tx.insert(jobSkills).values(ids.map(id => ({ jobId, skillId: id })))
      }
      if (requested.software) {
        await tx.delete(jobSoftware).where(eq(jobSoftware.jobId, jobId))
        const ids = lookupIds.software ?? []
        if (ids.length > 0) await tx.insert(jobSoftware).values(ids.map(id => ({ jobId, softwareId: id })))
      }
      if (requested.keywords) {
        await tx.delete(jobKeywords).where(eq(jobKeywords.jobId, jobId))
        const ids = lookupIds.keywords ?? []
        if (ids.length > 0) await tx.insert(jobKeywords).values(ids.map(id => ({ jobId, keywordId: id })))
      }
      if (requested.certifications) {
        await tx.delete(jobCertifications).where(eq(jobCertifications.jobId, jobId))
        const ids = lookupIds.certifications ?? []
        if (ids.length > 0) await tx.insert(jobCertifications).values(ids.map(id => ({ jobId, certificationId: id })))
      }
      await tx.update(jobs).set({ updatedAt: new Date() }).where(eq(jobs.id, jobId))
    })
  } catch (err) {
    logger.error('PATCH catalog job tags failed', { jobId, ...serializeError(err) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  logger.info('catalog job tags updated', { jobId, fields: Object.keys(parsed.data) })
  return NextResponse.json(await readJobTags(jobId))
}
