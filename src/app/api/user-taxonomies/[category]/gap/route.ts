import { NextRequest, NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import {
  userCertifications,
  userKeywords,
  userSkills,
  userSoftware,
} from '@/db/schema'
import { privateJson } from '@/lib/http'
import { resolveRequestUser } from '@/lib/resolved-user'
import { withUser } from '@/db/session'
import { logger, serializeError } from '@/lib/logger'
import { profileCategorySchema } from '@/lib/user-taxonomy-profile'
import { buildGapDemandQuery, GAP_JOB_TITLE_MAX_LENGTH } from '@/lib/taxonomy-gap-demand'

type Context = { params: Promise<{ category: string }> }

const configs = {
  skills: {
    profile: userSkills,
    profileId: userSkills.skillId,
    profileStatus: sql<string>`CASE WHEN ${userSkills.skillId} IS NULL THEN NULL WHEN ${userSkills.hasSkill} IS TRUE THEN 'held' ELSE 'not_held' END`,
    matched: sql<boolean>`${userSkills.hasSkill} IS TRUE`,
    excluded: sql<boolean>`FALSE`,
  },
  software: {
    profile: userSoftware,
    profileId: userSoftware.softwareId,
    profileStatus: sql<string>`CASE WHEN ${userSoftware.softwareId} IS NULL THEN NULL ELSE COALESCE(${userSoftware.familiarity}::text, 'listed') END`,
    matched: sql<boolean>`${userSoftware.softwareId} IS NOT NULL`,
    excluded: sql<boolean>`FALSE`,
  },
  certifications: {
    profile: userCertifications,
    profileId: userCertifications.certificationId,
    profileStatus: sql<string>`CASE WHEN ${userCertifications.certificationId} IS NULL THEN NULL ELSE 'held' END`,
    matched: sql<boolean>`${userCertifications.certificationId} IS NOT NULL`,
    excluded: sql<boolean>`FALSE`,
  },
  keywords: {
    profile: userKeywords,
    profileId: userKeywords.keywordId,
    profileStatus: sql<string>`${userKeywords.preference}::text`,
    matched: sql<boolean>`${userKeywords.preference} = 'interest'`,
    excluded: sql<boolean>`${userKeywords.preference} = 'exclusion'`,
  },
} as const

function rows<T>(result: unknown): T[] {
  return result as T[]
}

function parsePageParam(value: string | null, fallback: number, max?: number) {
  if (value === null) return fallback
  if (!/^\d+$/.test(value)) return null
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || (max !== undefined && parsed > max)) return null
  return parsed
}

export async function GET(req: NextRequest, context: Context) {
  const auth = await resolveRequestUser(req)
  if (!auth.ok) return auth.response
  const { category: rawCategory } = await context.params
  const category = profileCategorySchema.safeParse(rawCategory)
  if (!category.success) {
    return NextResponse.json(
      { error: 'Invalid category: expected skills, software, certifications, or keywords' },
      { status: 400 },
    )
  }

  const page = parsePageParam(req.nextUrl.searchParams.get('page'), 1)
  const limit = parsePageParam(req.nextUrl.searchParams.get('limit'), 50, 100)
  if (page === null || limit === null) {
    return NextResponse.json(
      { error: 'Invalid pagination: page must be positive and limit must be from 1 to 100' },
      { status: 400 },
    )
  }
  const queryRaw = req.nextUrl.searchParams.get('q')
  if (queryRaw !== null && queryRaw.length > 100) {
    return NextResponse.json({ error: 'Invalid q: maximum length is 100' }, { status: 400 })
  }
  const query = queryRaw?.trim() ?? ''
  const jobTitleRaw = req.nextUrl.searchParams.get('job_title')
  if (jobTitleRaw !== null && jobTitleRaw.length > GAP_JOB_TITLE_MAX_LENGTH) {
    return NextResponse.json(
      { error: `Invalid job_title: maximum length is ${GAP_JOB_TITLE_MAX_LENGTH}` },
      { status: 400 },
    )
  }
  const jobTitle = jobTitleRaw?.trim() || null
  const offset = (page - 1) * limit
  const config = configs[category.data]

  try {
    const demand = buildGapDemandQuery({
      category: category.data,
      userId: auth.user.id,
      nameQuery: query,
      jobTitle,
    })
    const { countResult, itemResult } = await withUser(auth.user.id, async (tx) => {
      const countResult = await tx.execute(sql`
      WITH demand AS (${demand}), scoped AS (
        SELECT demand.taxonomy_id,
               ${config.matched} AS matched,
               ${config.excluded} AS excluded
        FROM demand
        LEFT JOIN ${config.profile} ON ${config.profileId} = demand.taxonomy_id
          AND ${config.profile.userId} = ${auth.user.id}
      )
      SELECT CAST((SELECT COUNT(*) FROM ${config.profile} WHERE ${config.profile.userId} = ${auth.user.id}) AS int) AS "profile",
             CAST(COUNT(*) AS int) AS "demanded",
             CAST(COUNT(*) FILTER (WHERE matched) AS int) AS "matched",
             CAST(COUNT(*) FILTER (WHERE excluded) AS int) AS "excluded",
             CAST(COUNT(*) FILTER (
               WHERE NOT COALESCE(matched, FALSE) AND NOT COALESCE(excluded, FALSE)
             ) AS int) AS "gaps"
      FROM scoped
    `)
      const itemResult = await tx.execute(sql`
      WITH demand AS (${demand})
      SELECT demand.taxonomy_id AS "taxonomyId",
             demand.name AS "name",
             demand.job_count AS "jobCount",
             ${config.profileStatus} AS "profileStatus",
             CASE
               WHEN ${config.matched} THEN 'matched'
               WHEN ${config.excluded} THEN 'excluded'
               ELSE 'gap'
             END AS "matchState"
      FROM demand
      LEFT JOIN ${config.profile} ON ${config.profileId} = demand.taxonomy_id
        AND ${config.profile.userId} = ${auth.user.id}
      ORDER BY demand.job_count DESC, demand.name ASC
      LIMIT ${limit} OFFSET ${offset}
      `)
      return { countResult, itemResult }
    })
    const counts = rows<{
      profile: number
      demanded: number
      matched: number
      excluded: number
      gaps: number
    }>(countResult)[0] ?? { profile: 0, demanded: 0, matched: 0, excluded: 0, gaps: 0 }

    return privateJson({
      category: category.data,
      jobTitle,
      counts,
      items: rows(itemResult),
      page,
      totalPages: Math.ceil(counts.demanded / limit),
    })
  } catch (error) {
    logger.error('user taxonomy gap analysis failed', { category: category.data, ...serializeError(error) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
