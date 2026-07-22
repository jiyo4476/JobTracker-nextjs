import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import {
  certifications,
  keywords,
  skills,
  software,
  userCertifications,
  userKeywords,
  userSkills,
  userSoftware,
} from '@/db/schema'
import { requireAuthentication } from '@/lib/auth'
import { logger, serializeError } from '@/lib/logger'
import {
  parsePositiveProfileId,
  profileCategorySchema,
  profilePatchSchemas,
  type ProfileCategory,
} from '@/lib/user-taxonomy-profile'

type Context = { params: Promise<{ category: string; id: string }> }
type SkillPatch = { has_skill: boolean }
type SoftwarePatch = { familiarity: 'learning' | 'familiar' | 'proficient' | 'expert' | null }
type CertificationPatch = {
  issuer?: string | null
  earned_date?: string | null
  expires_at?: string | null
  credential_url?: string | null
}
type KeywordPatch = { preference: 'interest' | 'exclusion' }

async function readProfileItem(category: ProfileCategory, taxonomyId: number) {
  switch (category) {
    case 'skills': {
      const [item] = await db.select({
        taxonomyId: userSkills.skillId,
        name: skills.name,
        hasSkill: userSkills.hasSkill,
      }).from(userSkills).innerJoin(skills, eq(userSkills.skillId, skills.id))
        .where(eq(userSkills.skillId, taxonomyId)).limit(1)
      return item ?? null
    }
    case 'software': {
      const [item] = await db.select({
        taxonomyId: userSoftware.softwareId,
        name: software.name,
        familiarity: userSoftware.familiarity,
      }).from(userSoftware).innerJoin(software, eq(userSoftware.softwareId, software.id))
        .where(eq(userSoftware.softwareId, taxonomyId)).limit(1)
      return item ?? null
    }
    case 'certifications': {
      const [item] = await db.select({
        taxonomyId: userCertifications.certificationId,
        name: certifications.name,
        issuer: userCertifications.issuer,
        earnedDate: userCertifications.earnedDate,
        expiresAt: userCertifications.expiresAt,
        credentialUrl: userCertifications.credentialUrl,
      }).from(userCertifications)
        .innerJoin(certifications, eq(userCertifications.certificationId, certifications.id))
        .where(eq(userCertifications.certificationId, taxonomyId)).limit(1)
      return item ?? null
    }
    case 'keywords': {
      const [item] = await db.select({
        taxonomyId: userKeywords.keywordId,
        name: keywords.name,
        preference: userKeywords.preference,
      }).from(userKeywords).innerJoin(keywords, eq(userKeywords.keywordId, keywords.id))
        .where(eq(userKeywords.keywordId, taxonomyId)).limit(1)
      return item ?? null
    }
  }
}

async function parseTarget(context: Context) {
  const { category, id } = await context.params
  const parsedCategory = profileCategorySchema.safeParse(category)
  const taxonomyId = parsePositiveProfileId(id)
  return { parsedCategory, taxonomyId }
}

export async function PATCH(req: NextRequest, context: Context) {
  if (!(await requireAuthentication(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { parsedCategory, taxonomyId } = await parseTarget(context)
  if (!parsedCategory.success) {
    return NextResponse.json(
      { error: 'Invalid category: expected skills, software, certifications, or keywords' },
      { status: 400 },
    )
  }
  if (taxonomyId === null) {
    return NextResponse.json({ error: 'Invalid id: expected a positive integer' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = profilePatchSchemas[parsedCategory.data].safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const existing = await readProfileItem(parsedCategory.data, taxonomyId)
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    switch (parsedCategory.data) {
      case 'skills':
        await db.update(userSkills).set({ hasSkill: (parsed.data as SkillPatch).has_skill })
          .where(eq(userSkills.skillId, taxonomyId))
        break
      case 'software':
        await db.update(userSoftware).set({ familiarity: (parsed.data as SoftwarePatch).familiarity })
          .where(eq(userSoftware.softwareId, taxonomyId))
        break
      case 'certifications': {
        const data = parsed.data as CertificationPatch
        if (!('earnedDate' in existing)) throw new Error('Certification profile shape mismatch')
        const earnedDate = data.earned_date === undefined ? existing.earnedDate : data.earned_date
        const expiresAt = data.expires_at === undefined ? existing.expiresAt : data.expires_at
        if (earnedDate && expiresAt && expiresAt < earnedDate) {
          return NextResponse.json(
            { error: { formErrors: [], fieldErrors: { expires_at: ['Expiration date must not precede earned date'] } } },
            { status: 400 },
          )
        }
        await db.update(userCertifications).set({
          issuer: data.issuer,
          earnedDate: data.earned_date,
          expiresAt: data.expires_at,
          credentialUrl: data.credential_url,
        }).where(eq(userCertifications.certificationId, taxonomyId))
        break
      }
      case 'keywords':
        await db.update(userKeywords).set({ preference: (parsed.data as KeywordPatch).preference })
          .where(eq(userKeywords.keywordId, taxonomyId))
        break
    }

    const item = await readProfileItem(parsedCategory.data, taxonomyId)
    logger.info('user taxonomy profile item updated', { category: parsedCategory.data, taxonomyId })
    return NextResponse.json({ category: parsedCategory.data, item })
  } catch (error) {
    logger.error('user taxonomy profile update failed', {
      category: parsedCategory.data,
      taxonomyId,
      ...serializeError(error),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, context: Context) {
  if (!(await requireAuthentication(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { parsedCategory, taxonomyId } = await parseTarget(context)
  if (!parsedCategory.success) {
    return NextResponse.json(
      { error: 'Invalid category: expected skills, software, certifications, or keywords' },
      { status: 400 },
    )
  }
  if (taxonomyId === null) {
    return NextResponse.json({ error: 'Invalid id: expected a positive integer' }, { status: 400 })
  }

  try {
    let deleted: unknown[]
    switch (parsedCategory.data) {
      case 'skills':
        deleted = await db.delete(userSkills).where(eq(userSkills.skillId, taxonomyId)).returning()
        break
      case 'software':
        deleted = await db.delete(userSoftware).where(eq(userSoftware.softwareId, taxonomyId)).returning()
        break
      case 'certifications':
        deleted = await db.delete(userCertifications)
          .where(eq(userCertifications.certificationId, taxonomyId)).returning()
        break
      case 'keywords':
        deleted = await db.delete(userKeywords).where(eq(userKeywords.keywordId, taxonomyId)).returning()
        break
    }
    if (deleted.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    logger.info('user taxonomy profile item removed', { category: parsedCategory.data, taxonomyId })
    return NextResponse.json({ category: parsedCategory.data, taxonomyId, success: true })
  } catch (error) {
    logger.error('user taxonomy profile removal failed', {
      category: parsedCategory.data,
      taxonomyId,
      ...serializeError(error),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
