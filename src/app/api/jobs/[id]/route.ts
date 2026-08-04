import { NextRequest, NextResponse } from 'next/server'
import { withUser } from '@/db/session'
import { privateJson, deprecatedAlias } from '@/lib/http'
import { resolveRequestUser } from '@/lib/resolved-user'
import { patchCatalogJob, deleteCatalogJob } from '@/lib/admin-catalog-handlers'
import {
  jobs, companies, skills, software as softwareTable, keywords, certifications,
  jobSkills, jobSoftware, jobKeywords, jobCertifications,
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

// API-013 slice 1: catalog mutation is now admin-only and catalog-field-only. Personal
// state (stage, priority, applied/heard-back, notes, resume choice, …) moved to
// `PATCH /api/jobs/[id]/state`. These legacy paths are DEPRECATED admin-gated aliases of
// the canonical `/api/admin/jobs/[id]` and reject personal-state fields.
export const PATCH = deprecatedAlias(patchCatalogJob, '/api/admin/jobs/[id]')
export const DELETE = deprecatedAlias(deleteCatalogJob, '/api/admin/jobs/[id]')
