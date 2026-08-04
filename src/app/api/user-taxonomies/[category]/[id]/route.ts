import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
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
import { privateJson, readJsonBody } from '@/lib/http'
import { resolveRequestUser } from '@/lib/resolved-user'
import { withUser } from '@/db/session'
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
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function readProfileItem(tx: DbTransaction, userId: number, category: ProfileCategory, taxonomyId: number) {
  switch (category) {
    case 'skills': {
      const [item] = await tx.select({
        taxonomyId: userSkills.skillId,
        name: skills.name,
        hasSkill: userSkills.hasSkill,
      }).from(userSkills).innerJoin(skills, eq(userSkills.skillId, skills.id))
        .where(and(eq(userSkills.userId, userId), eq(userSkills.skillId, taxonomyId))).limit(1)
      return item ?? null
    }
    case 'software': {
      const [item] = await tx.select({
        taxonomyId: userSoftware.softwareId,
        name: software.name,
        familiarity: userSoftware.familiarity,
      }).from(userSoftware).innerJoin(software, eq(userSoftware.softwareId, software.id))
        .where(and(eq(userSoftware.userId, userId), eq(userSoftware.softwareId, taxonomyId))).limit(1)
      return item ?? null
    }
    case 'certifications': {
      const [item] = await tx.select({
        taxonomyId: userCertifications.certificationId,
        name: certifications.name,
        issuer: userCertifications.issuer,
        earnedDate: userCertifications.earnedDate,
        expiresAt: userCertifications.expiresAt,
        credentialUrl: userCertifications.credentialUrl,
      }).from(userCertifications)
        .innerJoin(certifications, eq(userCertifications.certificationId, certifications.id))
        .where(and(eq(userCertifications.userId, userId), eq(userCertifications.certificationId, taxonomyId))).limit(1)
      return item ?? null
    }
    case 'keywords': {
      const [item] = await tx.select({
        taxonomyId: userKeywords.keywordId,
        name: keywords.name,
        preference: userKeywords.preference,
      }).from(userKeywords).innerJoin(keywords, eq(userKeywords.keywordId, keywords.id))
        .where(and(eq(userKeywords.userId, userId), eq(userKeywords.keywordId, taxonomyId))).limit(1)
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
  const auth = await resolveRequestUser(req)
  if (!auth.ok) return auth.response
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

  const parsed = await readJsonBody(req, profilePatchSchemas[parsedCategory.data])
  if (!parsed.ok) return parsed.response

  try {
    const result = await withUser(auth.user.id, async (tx) => {
      const existing = await readProfileItem(tx, auth.user.id, parsedCategory.data, taxonomyId)
      if (!existing) return null
      switch (parsedCategory.data) {
      case 'skills':
        await tx.update(userSkills).set({ hasSkill: (parsed.data as SkillPatch).has_skill })
          .where(and(eq(userSkills.userId, auth.user.id), eq(userSkills.skillId, taxonomyId)))
        break
      case 'software':
        await tx.update(userSoftware).set({ familiarity: (parsed.data as SoftwarePatch).familiarity })
          .where(and(eq(userSoftware.userId, auth.user.id), eq(userSoftware.softwareId, taxonomyId)))
        break
      case 'certifications': {
        const data = parsed.data as CertificationPatch
        if (!('earnedDate' in existing)) throw new Error('Certification profile shape mismatch')
        const earnedDate = data.earned_date === undefined ? existing.earnedDate : data.earned_date
        const expiresAt = data.expires_at === undefined ? existing.expiresAt : data.expires_at
        if (earnedDate && expiresAt && expiresAt < earnedDate) {
          return privateJson(
            { error: { formErrors: [], fieldErrors: { expires_at: ['Expiration date must not precede earned date'] } } },
            { status: 400 },
          )
        }
        await tx.update(userCertifications).set({
          issuer: data.issuer,
          earnedDate: data.earned_date,
          expiresAt: data.expires_at,
          credentialUrl: data.credential_url,
        }).where(and(eq(userCertifications.userId, auth.user.id), eq(userCertifications.certificationId, taxonomyId)))
        break
      }
      case 'keywords':
        await tx.update(userKeywords).set({ preference: (parsed.data as KeywordPatch).preference })
          .where(and(eq(userKeywords.userId, auth.user.id), eq(userKeywords.keywordId, taxonomyId)))
        break
      }
      return readProfileItem(tx, auth.user.id, parsedCategory.data, taxonomyId)
    })
    if (!result) return privateJson({ error: 'Not found' }, { status: 404 })
    if (result instanceof NextResponse) return result
    logger.info('user taxonomy profile item updated', { category: parsedCategory.data, taxonomyId })
    return privateJson({ category: parsedCategory.data, item: result })
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
  const auth = await resolveRequestUser(req)
  if (!auth.ok) return auth.response
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
        deleted = await withUser(auth.user.id, (tx) => tx.delete(userSkills).where(and(eq(userSkills.userId, auth.user.id), eq(userSkills.skillId, taxonomyId))).returning())
        break
      case 'software':
        deleted = await withUser(auth.user.id, (tx) => tx.delete(userSoftware).where(and(eq(userSoftware.userId, auth.user.id), eq(userSoftware.softwareId, taxonomyId))).returning())
        break
      case 'certifications':
        deleted = await withUser(auth.user.id, (tx) => tx.delete(userCertifications)
          .where(and(eq(userCertifications.userId, auth.user.id), eq(userCertifications.certificationId, taxonomyId))).returning())
        break
      case 'keywords':
        deleted = await withUser(auth.user.id, (tx) => tx.delete(userKeywords).where(and(eq(userKeywords.userId, auth.user.id), eq(userKeywords.keywordId, taxonomyId))).returning())
        break
    }
    if (deleted.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    logger.info('user taxonomy profile item removed', { category: parsedCategory.data, taxonomyId })
    return privateJson({ category: parsedCategory.data, taxonomyId, success: true })
  } catch (error) {
    logger.error('user taxonomy profile removal failed', {
      category: parsedCategory.data,
      taxonomyId,
      ...serializeError(error),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
