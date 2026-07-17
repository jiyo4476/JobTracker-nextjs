import { NextRequest, NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
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
import { requireApiKey } from '@/lib/auth'
import { logger, serializeError } from '@/lib/logger'
import {
  profileCategorySchema,
  profileCreateSchemas,
  type ProfileCategory,
} from '@/lib/user-taxonomy-profile'

type Context = { params: Promise<{ category: string }> }
type CatalogItem = { taxonomyId: number; name: string }
type CreateTarget = { taxonomy_id?: number; name?: string }
type SkillCreate = CreateTarget & { has_skill: boolean }
type SoftwareCreate = CreateTarget & { familiarity?: 'learning' | 'familiar' | 'proficient' | 'expert' | null }
type CertificationCreate = CreateTarget & {
  issuer?: string | null
  earned_date?: string | null
  expires_at?: string | null
  credential_url?: string | null
}
type KeywordCreate = CreateTarget & { preference: 'interest' | 'exclusion' }
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

const catalogConfigs = {
  skills: { table: skills, id: skills.id, name: skills.name },
  software: { table: software, id: software.id, name: software.name },
  certifications: { table: certifications, id: certifications.id, name: certifications.name },
  keywords: { table: keywords, id: keywords.id, name: keywords.name },
} as const

function rows<T>(result: unknown): T[] {
  return result as T[]
}

async function parseCategory(context: Context) {
  const { category } = await context.params
  return profileCategorySchema.safeParse(category)
}

async function resolveCatalogItem(
  tx: DbTransaction,
  category: ProfileCategory,
  target: { taxonomy_id?: number; name?: string },
): Promise<CatalogItem | null> {
  const config = catalogConfigs[category]
  if (target.taxonomy_id !== undefined) {
    const result = await tx.execute(sql`
      SELECT ${config.id} AS "taxonomyId", ${config.name} AS "name"
      FROM ${config.table}
      WHERE ${config.id} = ${target.taxonomy_id}
      LIMIT 1
    `)
    return rows<CatalogItem>(result)[0] ?? null
  }

  const name = target.name!
  // Serialize creates for one normalized category/name without imposing a new
  // functional unique index on legacy catalog writers that still conflict on
  // exact spelling. The transaction-scoped lock is released automatically.
  await tx.execute(sql`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`user-taxonomy:${category}:${name.toLocaleLowerCase('en-US')}`}, 0)
    )
  `)
  const existing = await tx.execute(sql`
    SELECT ${config.id} AS "taxonomyId", ${config.name} AS "name"
    FROM ${config.table}
    WHERE lower(${config.name}) = lower(${name})
    LIMIT 1
  `)
  const existingItem = rows<CatalogItem>(existing)[0]
  if (existingItem) return existingItem

  const inserted = await tx.execute(sql`
    INSERT INTO ${config.table} ("name")
    VALUES (${name})
    ON CONFLICT DO NOTHING
    RETURNING ${config.id} AS "taxonomyId", ${config.name} AS "name"
  `)
  const insertedItem = rows<CatalogItem>(inserted)[0]
  if (insertedItem) return insertedItem

  // A concurrent case-insensitive insert may win the unique-index race.
  const raced = await tx.execute(sql`
    SELECT ${config.id} AS "taxonomyId", ${config.name} AS "name"
    FROM ${config.table}
    WHERE lower(${config.name}) = lower(${name})
    LIMIT 1
  `)
  return rows<CatalogItem>(raced)[0] ?? null
}

async function listProfile(category: ProfileCategory) {
  switch (category) {
    case 'skills':
      return db.select({
        taxonomyId: userSkills.skillId,
        name: skills.name,
        hasSkill: userSkills.hasSkill,
      }).from(userSkills).innerJoin(skills, sql`${userSkills.skillId} = ${skills.id}`).orderBy(skills.name)
    case 'software':
      return db.select({
        taxonomyId: userSoftware.softwareId,
        name: software.name,
        familiarity: userSoftware.familiarity,
      }).from(userSoftware).innerJoin(software, sql`${userSoftware.softwareId} = ${software.id}`).orderBy(software.name)
    case 'certifications':
      return db.select({
        taxonomyId: userCertifications.certificationId,
        name: certifications.name,
        issuer: userCertifications.issuer,
        earnedDate: userCertifications.earnedDate,
        expiresAt: userCertifications.expiresAt,
        credentialUrl: userCertifications.credentialUrl,
      }).from(userCertifications)
        .innerJoin(certifications, sql`${userCertifications.certificationId} = ${certifications.id}`)
        .orderBy(certifications.name)
    case 'keywords':
      return db.select({
        taxonomyId: userKeywords.keywordId,
        name: keywords.name,
        preference: userKeywords.preference,
      }).from(userKeywords).innerJoin(keywords, sql`${userKeywords.keywordId} = ${keywords.id}`).orderBy(keywords.name)
  }
}

async function getProfileItem(category: ProfileCategory, taxonomyId: number) {
  const items = await listProfile(category)
  return items.find((item) => item.taxonomyId === taxonomyId) ?? null
}

export async function GET(req: NextRequest, context: Context) {
  if (!(await requireApiKey(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const category = await parseCategory(context)
  if (!category.success) {
    return NextResponse.json(
      { error: 'Invalid category: expected skills, software, certifications, or keywords' },
      { status: 400 },
    )
  }

  try {
    return NextResponse.json({ category: category.data, items: await listProfile(category.data) })
  } catch (error) {
    logger.error('user taxonomy profile list failed', { category: category.data, ...serializeError(error) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, context: Context) {
  if (!(await requireApiKey(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const category = await parseCategory(context)
  if (!category.success) {
    return NextResponse.json(
      { error: 'Invalid category: expected skills, software, certifications, or keywords' },
      { status: 400 },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = profileCreateSchemas[category.data].safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const outcome = await db.transaction(async (tx) => {
      const catalogItem = await resolveCatalogItem(tx, category.data, parsed.data as CreateTarget)
      if (!catalogItem) return null

      let inserted: unknown[]
      switch (category.data) {
        case 'skills': {
          const data = parsed.data as SkillCreate
          inserted = await tx.insert(userSkills).values({
            skillId: catalogItem.taxonomyId,
            hasSkill: data.has_skill,
          }).onConflictDoNothing().returning()
          break
        }
        case 'software': {
          const data = parsed.data as SoftwareCreate
          inserted = await tx.insert(userSoftware).values({
            softwareId: catalogItem.taxonomyId,
            familiarity: data.familiarity,
          }).onConflictDoNothing().returning()
          break
        }
        case 'certifications': {
          const data = parsed.data as CertificationCreate
          inserted = await tx.insert(userCertifications).values({
            certificationId: catalogItem.taxonomyId,
            issuer: data.issuer,
            earnedDate: data.earned_date,
            expiresAt: data.expires_at,
            credentialUrl: data.credential_url,
          }).onConflictDoNothing().returning()
          break
        }
        case 'keywords': {
          const data = parsed.data as KeywordCreate
          inserted = await tx.insert(userKeywords).values({
            keywordId: catalogItem.taxonomyId,
            preference: data.preference,
          }).onConflictDoNothing().returning()
          break
        }
      }
      return { catalogItem, created: inserted.length > 0 }
    })
    if (!outcome) {
      return NextResponse.json({ error: `${category.data} value not found` }, { status: 404 })
    }

    const item = await getProfileItem(category.data, outcome.catalogItem.taxonomyId)
    if (!item) throw new Error('Profile association could not be read after insert')
    logger.info('user taxonomy profile item added', {
      category: category.data,
      taxonomyId: outcome.catalogItem.taxonomyId,
      created: outcome.created,
    })
    return NextResponse.json(
      { category: category.data, item, created: outcome.created },
      { status: outcome.created ? 201 : 200 },
    )
  } catch (error) {
    logger.error('user taxonomy profile add failed', { category: category.data, ...serializeError(error) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
