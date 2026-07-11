import { NextResponse } from 'next/server'
import { db } from '@/db'
import { companies, jobs } from '@/db/schema'
import { logger, serializeError } from '@/lib/logger'
import { eq, sql } from 'drizzle-orm'

export async function GET() {
  try {
    return await listCompanies()
  } catch (err) {
    logger.error('GET /api/companies failed', serializeError(err))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function listCompanies() {
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
    .orderBy(sql`count(${jobs.id}) desc`)

  return NextResponse.json(rows)
}
