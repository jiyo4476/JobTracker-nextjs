import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { db } from '@/db'
import { companies, jobs } from '@/db/schema'
import { logger, serializeError } from '@/lib/logger'
import { parseListPagination } from '@/lib/http'
import { eq, sql } from 'drizzle-orm'

export async function GET(req?: NextRequest) {
  try {
    return await listCompanies(req)
  } catch (err) {
    logger.error('GET /api/companies failed', serializeError(err))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function listCompanies(req?: NextRequest) {
  const { limit, offset } = parseListPagination(req)
  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      website: companies.website,
      industry: companies.industry,
      hqLocation: companies.hqLocation,
      jobCount: sql<number>`cast(count(${jobs.id}) as int)`,
      avgSalaryMax: sql<number>`cast(avg(${jobs.salaryMax}) as int)`,
    })
    .from(companies)
    .leftJoin(jobs, eq(companies.id, jobs.companyId))
    .groupBy(companies.id, companies.name, companies.website, companies.industry, companies.hqLocation)
    .orderBy(sql`count(${jobs.id}) desc`, companies.id)
    .limit(limit)
    .offset(offset)

  return NextResponse.json(rows)
}
