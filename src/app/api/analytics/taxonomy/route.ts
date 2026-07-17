import { NextRequest, NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  certifications,
  jobCertifications,
  jobKeywords,
  jobSkills,
  jobSoftware,
  keywords,
  skills,
  software,
} from '@/db/schema'
import { logger, serializeError } from '@/lib/logger'
import { sourcePlatformEnum } from '@/lib/schemas'
import { taxonomyCategorySchema, type TaxonomyCategory } from '@/lib/taxonomy'

const taxonomyConfigs = {
  skills: {
    junction: jobSkills,
    catalog: skills,
    jobId: jobSkills.jobId,
    relationId: jobSkills.skillId,
    catalogId: skills.id,
    name: skills.name,
  },
  software: {
    junction: jobSoftware,
    catalog: software,
    jobId: jobSoftware.jobId,
    relationId: jobSoftware.softwareId,
    catalogId: software.id,
    name: software.name,
  },
  certifications: {
    junction: jobCertifications,
    catalog: certifications,
    jobId: jobCertifications.jobId,
    relationId: jobCertifications.certificationId,
    catalogId: certifications.id,
    name: certifications.name,
  },
  keywords: {
    junction: jobKeywords,
    catalog: keywords,
    jobId: jobKeywords.jobId,
    relationId: jobKeywords.keywordId,
    catalogId: keywords.id,
    name: keywords.name,
  },
} as const

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function isValidIsoDate(value: string) {
  if (!ISO_DATE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
}

type AnalyticsFilters = {
  from: string | null
  to: string | null
  platform: string | null
  clearance: boolean | null
}

function topValuesQuery(
  category: TaxonomyCategory,
  filters: AnalyticsFilters,
  limit: number,
  clearanceGroup?: boolean,
) {
  const config = taxonomyConfigs[category]
  const clearanceFilter = clearanceGroup === undefined
    ? filters.clearance === null
      ? sql``
      : filters.clearance
        ? sql`AND security_clearance_req IS TRUE`
        : sql`AND security_clearance_req IS NOT TRUE`
    : clearanceGroup
      ? sql`AND security_clearance_req IS TRUE`
      : sql`AND security_clearance_req IS NOT TRUE`

  return db.execute(sql`
    WITH filtered_jobs AS (
      SELECT id
      FROM jobs
      WHERE is_active IS TRUE
        ${filters.from ? sql`AND date_found >= ${filters.from}::date` : sql``}
        ${filters.to ? sql`AND date_found <= ${filters.to}::date` : sql``}
        ${filters.platform ? sql`AND source_platform = ${filters.platform}` : sql``}
        ${clearanceFilter}
    ), value_counts AS (
      SELECT ${config.name} AS name,
             CAST(COUNT(DISTINCT filtered_jobs.id) AS int) AS count
      FROM ${config.junction}
      JOIN ${config.catalog} ON ${config.relationId} = ${config.catalogId}
      JOIN filtered_jobs ON ${config.jobId} = filtered_jobs.id
      GROUP BY ${config.catalogId}, ${config.name}
    )
    SELECT name,
           count,
           CAST(ROUND(count * 100.0 / NULLIF(SUM(count) OVER (), 0), 1) AS float8) AS percentage
    FROM value_counts
    ORDER BY count DESC, name ASC
    LIMIT ${limit}
  `)
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const categoryParsed = taxonomyCategorySchema.safeParse(searchParams.get('category'))
  if (!categoryParsed.success) {
    return NextResponse.json(
      { error: 'Invalid category: expected skills, software, certifications, or keywords' },
      { status: 400 },
    )
  }

  const compare = searchParams.get('compare')
  if (compare !== null && compare !== 'clearance') {
    return NextResponse.json({ error: 'Invalid compare: expected clearance' }, { status: 400 })
  }

  const limitRaw = searchParams.get('limit') ?? '15'
  const limit = Number(limitRaw)
  if (!/^\d+$/.test(limitRaw) || !Number.isInteger(limit) || limit < 1 || limit > 50) {
    return NextResponse.json({ error: 'Invalid limit: expected an integer from 1 to 50' }, { status: 400 })
  }

  const from = searchParams.get('from')
  const to = searchParams.get('to')
  if ((from && !isValidIsoDate(from)) || (to && !isValidIsoDate(to))) {
    return NextResponse.json({ error: 'Invalid date: expected YYYY-MM-DD' }, { status: 400 })
  }
  if (from && to && from > to) {
    return NextResponse.json({ error: 'Invalid date range: from must not be after to' }, { status: 400 })
  }

  const platformRaw = searchParams.get('platform')
  const platformParsed = sourcePlatformEnum.safeParse(platformRaw)
  if (platformRaw && !platformParsed.success) {
    return NextResponse.json({ error: 'Invalid platform' }, { status: 400 })
  }

  const clearanceRaw = searchParams.get('security_clearance')
  if (clearanceRaw !== null && clearanceRaw !== 'true' && clearanceRaw !== 'false') {
    return NextResponse.json({ error: 'Invalid security_clearance: expected true or false' }, { status: 400 })
  }
  if (compare === 'clearance' && clearanceRaw !== null) {
    return NextResponse.json(
      { error: 'security_clearance cannot be combined with compare=clearance' },
      { status: 400 },
    )
  }

  const filters: AnalyticsFilters = {
    from,
    to,
    platform: platformParsed.success ? platformParsed.data : null,
    clearance: clearanceRaw === null ? null : clearanceRaw === 'true',
  }

  try {
    const denominator = 'all distinct job-to-value assignments in the group after filters, before limit'
    if (compare === 'clearance') {
      const [clearanceRequired, clearanceNotRequired] = await Promise.all([
        topValuesQuery(categoryParsed.data, filters, limit, true),
        topValuesQuery(categoryParsed.data, filters, limit, false),
      ])
      const response = NextResponse.json({
        category: categoryParsed.data,
        percentage_denominator: denominator,
        clearance_required: clearanceRequired,
        clearance_not_required: clearanceNotRequired,
      })
      response.headers.set('Cache-Control', 's-maxage=60, stale-while-revalidate=60')
      return response
    }

    const values = await topValuesQuery(categoryParsed.data, filters, limit)
    const response = NextResponse.json({
      category: categoryParsed.data,
      percentage_denominator: denominator,
      values,
    })
    response.headers.set('Cache-Control', 's-maxage=60, stale-while-revalidate=60')
    return response
  } catch (error) {
    logger.error('GET /api/analytics/taxonomy failed', serializeError(error))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
