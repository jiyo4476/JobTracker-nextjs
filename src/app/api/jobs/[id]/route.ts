import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { withUser } from '@/db/session'
import { requireAuth, readJsonBody, privateJson } from '@/lib/http'
import { resolveRequestUser } from '@/lib/resolved-user'
import { jobPatchSchema } from '@/lib/schemas'
import { logger, serializeError } from '@/lib/logger'
import { hourlyToAnnualEquivalentCents } from '@/lib/salary-format'
import {
  jobs, companies, skills, software as softwareTable, keywords, certifications,
  jobSkills, jobSoftware, jobKeywords, jobCertifications, jobStatusHistory,
  userJobState, userJobContacts, resumeVersions,
} from '@/db/schema'
import { eq, and, asc } from 'drizzle-orm'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // API-013: the detail response embeds ONLY the current user's state, contacts
  // (email/phone PII), and selected resume — never another user's. So it requires a
  // resolved interactive user and is never cached across users.
  const auth = await resolveRequestUser(req)
  if (!auth.ok) return auth.response
  const userId = auth.user.id

  const { id } = await params
  const jobId = parseInt(id)
  if (isNaN(jobId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  return withUser(userId, async (tx) => {
    // Catalog facts are global (no personal application columns are read from `jobs`).
    const [job] = await tx
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
        salaryCurrency: jobs.salaryCurrency,
        datePosted: jobs.datePosted,
        dateFound: jobs.dateFound,
        lastScrapedAt: jobs.lastScrapedAt,
        isActive: jobs.isActive,
        applicationDeadline: jobs.applicationDeadline,
        securityClearanceReq: jobs.securityClearanceReq,
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

    // Owner-scoped reads: every predicate pins user_id to the resolved user.
    const [stateRow] = await tx
      .select({
        priority: userJobState.priority,
        isHidden: userJobState.isHidden,
        hasApplied: userJobState.hasApplied,
        dateApplied: userJobState.dateApplied,
        heardBack: userJobState.heardBack,
        interviewStage: userJobState.interviewStage,
        referral: userJobState.referral,
        coverLetterSubmitted: userJobState.coverLetterSubmitted,
        resumeVersionId: userJobState.resumeVersionId,
        rejectionReason: userJobState.rejectionReason,
        notes: userJobState.notes,
        createdAt: userJobState.createdAt,
        updatedAt: userJobState.updatedAt,
      })
      .from(userJobState)
      .where(and(eq(userJobState.userId, userId), eq(userJobState.jobId, jobId)))
      .limit(1)

    const [jobSkillRows, jobSoftwareRows, jobKeywordRows, jobCertRows, contactRows] = await Promise.all([
      tx.select({ id: skills.id, name: skills.name }).from(skills).innerJoin(jobSkills, eq(skills.id, jobSkills.skillId)).where(eq(jobSkills.jobId, jobId)),
      tx.select({ id: softwareTable.id, name: softwareTable.name }).from(softwareTable).innerJoin(jobSoftware, eq(softwareTable.id, jobSoftware.softwareId)).where(eq(jobSoftware.jobId, jobId)),
      tx.select({ id: keywords.id, name: keywords.name }).from(keywords).innerJoin(jobKeywords, eq(keywords.id, jobKeywords.keywordId)).where(eq(jobKeywords.jobId, jobId)),
      tx.select({ id: certifications.id, name: certifications.name }).from(certifications).innerJoin(jobCertifications, eq(certifications.id, jobCertifications.certificationId)).where(eq(jobCertifications.jobId, jobId)),
      // Contacts are per-user overlay rows — scoped to (user_id, job_id).
      tx.select({
        id: userJobContacts.id,
        name: userJobContacts.name,
        title: userJobContacts.title,
        email: userJobContacts.email,
        phone: userJobContacts.phone,
        linkedinUrl: userJobContacts.linkedinUrl,
        role: userJobContacts.role,
        contactedAt: userJobContacts.contactedAt,
        notes: userJobContacts.notes,
        createdAt: userJobContacts.createdAt,
      }).from(userJobContacts)
        .where(and(eq(userJobContacts.userId, userId), eq(userJobContacts.jobId, jobId)))
        .orderBy(asc(userJobContacts.createdAt)),
    ])

    // Selected resume must belong to the same user (owner predicate on both columns).
    let selectedResume = null
    if (stateRow?.resumeVersionId != null) {
      const [resume] = await tx
        .select({
          id: resumeVersions.id,
          label: resumeVersions.label,
          filePath: resumeVersions.filePath,
          date: resumeVersions.date,
          notes: resumeVersions.notes,
        })
        .from(resumeVersions)
        .where(and(eq(resumeVersions.id, stateRow.resumeVersionId), eq(resumeVersions.userId, userId)))
        .limit(1)
      selectedResume = resume ?? null
    }

    const userState = stateRow ?? null

    return privateJson({
      ...job,
      // Transitional flattened personal fields (null/default when untracked).
      priority: userState?.priority ?? null,
      interviewStage: userState?.interviewStage ?? null,
      hasApplied: userState?.hasApplied ?? false,
      dateApplied: userState?.dateApplied ?? null,
      heardBack: userState?.heardBack ?? false,
      referral: userState?.referral ?? false,
      coverLetterSubmitted: userState?.coverLetterSubmitted ?? false,
      rejectionReason: userState?.rejectionReason ?? null,
      notes: userState?.notes ?? null,
      isTracked: userState !== null,
      isHidden: userState?.isHidden ?? false,
      // Versioned nested contract.
      userState,
      selectedResume,
      skills: jobSkillRows,
      software: jobSoftwareRows,
      keywords: jobKeywordRows,
      certifications: jobCertRows,
      contacts: contactRows,
    })
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth(req)
  if (authError) return authError

  const { id } = await params
  const jobId = parseInt(id)
  if (isNaN(jobId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const parsed = await readJsonBody(req, jobPatchSchema)
  if (!parsed.ok) return parsed.response

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
      if (d.hourly_rate_min !== undefined) annualEquivalentMin = hourlyToAnnualEquivalentCents(d.hourly_rate_min)
      if (d.hourly_rate_max !== undefined) annualEquivalentMax = hourlyToAnnualEquivalentCents(d.hourly_rate_max)
    } else if (salaryType === 'annual') {
      if (d.salary_min !== undefined) annualEquivalentMin = d.salary_min
      if (d.salary_max !== undefined) annualEquivalentMax = d.salary_max
    }
  }

  try {
  await db.update(jobs).set({
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
    ...(d.has_applied !== undefined && { hasApplied: d.has_applied }),
    ...(d.date_applied !== undefined && { dateApplied: d.date_applied || null }),
    ...(d.heard_back !== undefined && { heardBack: d.heard_back }),
    ...(d.interview_stage !== undefined && { interviewStage: d.interview_stage }),
    ...(d.is_active !== undefined && { isActive: d.is_active }),
    ...(d.is_active === true && { deletedAt: null }),
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
  const authError = await requireAuth(req)
  if (authError) return authError

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
