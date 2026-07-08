import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { requireApiKey } from '@/lib/auth'
import { jobPatchSchema } from '@/lib/schemas'
import { logger, serializeError } from '@/lib/logger'
import {
  jobs, companies, skills, software as softwareTable, keywords, certifications,
  jobSkills, jobSoftware, jobKeywords, jobCertifications, contacts, jobStatusHistory,
} from '@/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const jobId = parseInt(id)
  if (isNaN(jobId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const [job] = await db
    .select({
      id: jobs.id,
      jobTitle: jobs.jobTitle,
      jobLink: jobs.jobLink,
      jobLocation: jobs.jobLocation,
      isRemote: jobs.isRemote,
      sourcePlatform: jobs.sourcePlatform,
      externalJobId: jobs.externalJobId,
      jobType: jobs.jobType,
      experienceLevel: jobs.experienceLevel,
      jobDescription: jobs.jobDescription,
      salaryType: jobs.salaryType,
      salaryMin: jobs.salaryMin,
      salaryMax: jobs.salaryMax,
      hourlyRateMin: jobs.hourlyRateMin,
      hourlyRateMax: jobs.hourlyRateMax,
      annualEquivalentMin: jobs.annualEquivalentMin,
      annualEquivalentMax: jobs.annualEquivalentMax,
      salaryText: jobs.salaryText,
      hasApplied: jobs.hasApplied,
      dateApplied: jobs.dateApplied,
      heardBack: jobs.heardBack,
      interviewStage: jobs.interviewStage,
      datePosted: jobs.datePosted,
      dateFound: jobs.dateFound,
      lastScrapedAt: jobs.lastScrapedAt,
      isActive: jobs.isActive,
      applicationDeadline: jobs.applicationDeadline,
      securityClearanceReq: jobs.securityClearanceReq,
      priority: jobs.priority,
      referral: jobs.referral,
      coverLetterSubmitted: jobs.coverLetterSubmitted,
      resumeVersion: jobs.resumeVersion,
      rejectionReason: jobs.rejectionReason,
      notes: jobs.notes,
      createdAt: jobs.createdAt,
      updatedAt: jobs.updatedAt,
      companyId: jobs.companyId,
      companyName: companies.name,
    })
    .from(jobs)
    .leftJoin(companies, eq(jobs.companyId, companies.id))
    .where(eq(jobs.id, jobId))
    .limit(1)

  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [jobSkillRows, jobSoftwareRows, jobKeywordRows, jobCertRows, contactRows] = await Promise.all([
    db.select({ id: skills.id, name: skills.name }).from(skills).innerJoin(jobSkills, eq(skills.id, jobSkills.skillId)).where(eq(jobSkills.jobId, jobId)),
    db.select({ id: softwareTable.id, name: softwareTable.name }).from(softwareTable).innerJoin(jobSoftware, eq(softwareTable.id, jobSoftware.softwareId)).where(eq(jobSoftware.jobId, jobId)),
    db.select({ id: keywords.id, name: keywords.name }).from(keywords).innerJoin(jobKeywords, eq(keywords.id, jobKeywords.keywordId)).where(eq(jobKeywords.jobId, jobId)),
    db.select({ id: certifications.id, name: certifications.name }).from(certifications).innerJoin(jobCertifications, eq(certifications.id, jobCertifications.certificationId)).where(eq(jobCertifications.jobId, jobId)),
    db.select().from(contacts).where(eq(contacts.jobId, jobId)),
  ])

  return NextResponse.json({
    ...job,
    skills: jobSkillRows,
    software: jobSoftwareRows,
    keywords: jobKeywordRows,
    certifications: jobCertRows,
    contacts: contactRows,
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireApiKey(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const jobId = parseInt(id)
  if (isNaN(jobId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const parsed = jobPatchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const d = parsed.data

  // Track stage change for activity feed
  if (d.interview_stage !== undefined) {
    const [current] = await db
      .select({ interviewStage: jobs.interviewStage })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1)
    if (current && current.interviewStage !== d.interview_stage) {
      await db.insert(jobStatusHistory).values({
        jobId,
        fromStage: current.interviewStage,
        toStage: d.interview_stage,
      })
    }
  }

  // Recompute annual equivalents when salary fields change.
  // If salary_type isn't in the patch, read it from the DB so we don't
  // corrupt annual_equivalent_* when only a rate field is updated.
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
      if (d.hourly_rate_min !== undefined) annualEquivalentMin = Math.round(d.hourly_rate_min * 2080 * 100)
      if (d.hourly_rate_max !== undefined) annualEquivalentMax = Math.round(d.hourly_rate_max * 2080 * 100)
    } else if (salaryType === 'annual') {
      if (d.salary_min !== undefined) annualEquivalentMin = d.salary_min
      if (d.salary_max !== undefined) annualEquivalentMax = d.salary_max
    }
  }

  try {
  await db.update(jobs).set({
    ...(d.job_title !== undefined && { jobTitle: d.job_title }),
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
    ...(d.has_applied !== undefined && { hasApplied: d.has_applied }),
    ...(d.date_applied !== undefined && { dateApplied: d.date_applied || null }),
    ...(d.heard_back !== undefined && { heardBack: d.heard_back }),
    ...(d.interview_stage !== undefined && { interviewStage: d.interview_stage }),
    ...(d.is_active !== undefined && { isActive: d.is_active }),
    ...(d.priority !== undefined && { priority: d.priority }),
    ...(d.notes !== undefined && { notes: d.notes }),
    ...(d.resume_version !== undefined && { resumeVersion: d.resume_version }),
    ...(d.rejection_reason !== undefined && { rejectionReason: d.rejection_reason }),
    ...(d.referral !== undefined && { referral: d.referral }),
    ...(d.cover_letter_submitted !== undefined && { coverLetterSubmitted: d.cover_letter_submitted }),
    ...(d.application_deadline !== undefined && { applicationDeadline: d.application_deadline || null }),
    ...(annualEquivalentMin !== undefined && { annualEquivalentMin }),
    ...(annualEquivalentMax !== undefined && { annualEquivalentMax }),
    updatedAt: new Date(),
  }).where(eq(jobs.id, jobId))
  } catch (err) {
    logger.error('PATCH /api/jobs/[id] failed', { jobId, ...serializeError(err) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  logger.info('job updated', { jobId, fields: Object.keys(d) })
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireApiKey(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const jobId = parseInt(id)
  if (isNaN(jobId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  let result: { id: number }[]
  try {
    result = await db
      .update(jobs)
      .set({ isActive: false, deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(jobs.id, jobId))
      .returning({ id: jobs.id })
  } catch (err) {
    logger.error('DELETE /api/jobs/[id] failed', { jobId, ...serializeError(err) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  if (result.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  logger.info('job soft-deleted', { jobId })
  return NextResponse.json({ success: true })
}
