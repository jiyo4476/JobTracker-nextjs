import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { requireAuth, readJsonBody } from '@/lib/http'
import { upsertLookupIds } from '@/lib/db-utils'
import { jobTagsPatchSchema } from '@/lib/schemas'
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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth(req)
  if (denied) return denied

  const { id } = await params
  const jobId = parseInt(id)
  if (isNaN(jobId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const parsed = await readJsonBody(req, jobTagsPatchSchema)
  if (!parsed.ok) return parsed.response

  const [job] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, jobId)).limit(1)
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const requested: Record<TagKey, string[] | undefined> = {
    skills: uniqueNames(parsed.data.skills),
    software: uniqueNames(parsed.data.software),
    keywords: uniqueNames(parsed.data.keywords),
    certifications: uniqueNames(parsed.data.certifications),
  }

  // Resolve every requested tag name to its lookup id up front (outside the
  // transaction), using the shared upsert helper so create/conflict semantics
  // match the scrape and backfill paths.
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
    logger.error('PATCH /api/jobs/[id]/tags failed', { jobId, ...serializeError(err) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  logger.info('job tags updated', { jobId, fields: Object.keys(parsed.data) })
  return NextResponse.json(await readJobTags(jobId))
}
