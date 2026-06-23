import { NextResponse } from 'next/server'
import { db } from '@/db'
import { jobStatusHistory, jobs, companies } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'

export async function GET() {
  const rows = await db
    .select({
      id: jobStatusHistory.id,
      jobId: jobStatusHistory.jobId,
      jobTitle: jobs.jobTitle,
      companyName: companies.name,
      fromStage: jobStatusHistory.fromStage,
      toStage: jobStatusHistory.toStage,
      changedAt: jobStatusHistory.changedAt,
    })
    .from(jobStatusHistory)
    .innerJoin(jobs, eq(jobStatusHistory.jobId, jobs.id))
    .leftJoin(companies, eq(jobs.companyId, companies.id))
    .orderBy(desc(jobStatusHistory.changedAt))
    .limit(20)

  const data = rows.map((r) => ({
    id: r.id,
    jobId: r.jobId,
    jobTitle: r.jobTitle,
    companyName: r.companyName ?? null,
    fromStage: r.fromStage ?? null,
    toStage: r.toStage,
    changedAt: r.changedAt ? r.changedAt.toISOString() : new Date().toISOString(),
  }))

  const res = NextResponse.json(data)
  res.headers.set('Cache-Control', 's-maxage=30, stale-while-revalidate=30')
  return res
}
