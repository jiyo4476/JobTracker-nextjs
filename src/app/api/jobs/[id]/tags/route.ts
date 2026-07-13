import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { requireApiKey } from '@/lib/auth'
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
import { eq, inArray } from 'drizzle-orm'

type TagKey = 'skills' | 'software' | 'keywords' | 'certifications'
type TagRow = { id: number; name: string }

function uniqueNames(values: string[] | undefined) {
  if (!values) return undefined
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)))
}

async function createAndReadTagRows(
  names: string[],
  create: () => PromiseLike<unknown>,
  read: () => PromiseLike<TagRow[]>,
) {
  if (names.length === 0) return []
  await create()
  return read()
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
  if (!(await requireApiKey(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const jobId = parseInt(id)
  if (isNaN(jobId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const parsed = jobTagsPatchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const [job] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, jobId)).limit(1)
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const requested: Record<TagKey, string[] | undefined> = {
    skills: uniqueNames(parsed.data.skills),
    software: uniqueNames(parsed.data.software),
    keywords: uniqueNames(parsed.data.keywords),
    certifications: uniqueNames(parsed.data.certifications),
  }

  const lookupRows: Partial<Record<TagKey, TagRow[]>> = {}
  if (requested.skills) lookupRows.skills = await createAndReadTagRows(
    requested.skills,
    () => db.insert(skills).values(requested.skills!.map(name => ({ name }))).onConflictDoNothing(),
    () => db.select({ id: skills.id, name: skills.name }).from(skills).where(inArray(skills.name, requested.skills!)),
  )
  if (requested.software) lookupRows.software = await createAndReadTagRows(
    requested.software,
    () => db.insert(softwareTable).values(requested.software!.map(name => ({ name }))).onConflictDoNothing(),
    () => db.select({ id: softwareTable.id, name: softwareTable.name }).from(softwareTable).where(inArray(softwareTable.name, requested.software!)),
  )
  if (requested.keywords) lookupRows.keywords = await createAndReadTagRows(
    requested.keywords,
    () => db.insert(keywords).values(requested.keywords!.map(name => ({ name }))).onConflictDoNothing(),
    () => db.select({ id: keywords.id, name: keywords.name }).from(keywords).where(inArray(keywords.name, requested.keywords!)),
  )
  if (requested.certifications) lookupRows.certifications = await createAndReadTagRows(
    requested.certifications,
    () => db.insert(certifications).values(requested.certifications!.map(name => ({ name }))).onConflictDoNothing(),
    () => db.select({ id: certifications.id, name: certifications.name }).from(certifications).where(inArray(certifications.name, requested.certifications!)),
  )

  try {
    await db.transaction(async tx => {
      if (requested.skills) {
        await tx.delete(jobSkills).where(eq(jobSkills.jobId, jobId))
        const rows = lookupRows.skills ?? []
        if (rows.length > 0) await tx.insert(jobSkills).values(rows.map(row => ({ jobId, skillId: row.id })))
      }
      if (requested.software) {
        await tx.delete(jobSoftware).where(eq(jobSoftware.jobId, jobId))
        const rows = lookupRows.software ?? []
        if (rows.length > 0) await tx.insert(jobSoftware).values(rows.map(row => ({ jobId, softwareId: row.id })))
      }
      if (requested.keywords) {
        await tx.delete(jobKeywords).where(eq(jobKeywords.jobId, jobId))
        const rows = lookupRows.keywords ?? []
        if (rows.length > 0) await tx.insert(jobKeywords).values(rows.map(row => ({ jobId, keywordId: row.id })))
      }
      if (requested.certifications) {
        await tx.delete(jobCertifications).where(eq(jobCertifications.jobId, jobId))
        const rows = lookupRows.certifications ?? []
        if (rows.length > 0) await tx.insert(jobCertifications).values(rows.map(row => ({ jobId, certificationId: row.id })))
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
