import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { requireApiKey } from '@/lib/auth'
import { jobPatchSchema } from '@/lib/schemas'
import {
  jobs, companies, skills, software as softwareTable, keywords, certifications,
  jobSkills, jobSoftware, jobKeywords, jobCertifications, contacts,
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
  await db.update(jobs).set({
    ...(d.job_title !== undefined && { jobTitle: d.job_title }),
    ...(d.job_location !== undefined && { jobLocation: d.job_location }),
    ...(d.is_remote !== undefined && { isRemote: d.is_remote }),
    ...(d.job_description !== undefined && { jobDescription: d.job_description }),
    ...(d.date_posted !== undefined && { datePosted: d.date_posted }),
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
    ...(d.date_applied !== undefined && { dateApplied: d.date_applied }),
    ...(d.heard_back !== undefined && { heardBack: d.heard_back }),
    ...(d.interview_stage !== undefined && { interviewStage: d.interview_stage }),
    ...(d.is_active !== undefined && { isActive: d.is_active }),
    ...(d.priority !== undefined && { priority: d.priority }),
    ...(d.notes !== undefined && { notes: d.notes }),
    ...(d.resume_version !== undefined && { resumeVersion: d.resume_version }),
    ...(d.rejection_reason !== undefined && { rejectionReason: d.rejection_reason }),
    ...(d.referral !== undefined && { referral: d.referral }),
    ...(d.cover_letter_submitted !== undefined && { coverLetterSubmitted: d.cover_letter_submitted }),
    ...(d.application_deadline !== undefined && { applicationDeadline: d.application_deadline }),
    updatedAt: new Date(),
  }).where(eq(jobs.id, jobId))

  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireApiKey(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const jobId = parseInt(id)
  if (isNaN(jobId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  await db.update(jobs).set({ isActive: false, updatedAt: new Date() }).where(eq(jobs.id, jobId))
  return NextResponse.json({ success: true })
}
