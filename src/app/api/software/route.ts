import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { db } from '@/db'
import { software, jobSoftware } from '@/db/schema'
import { parseListPagination } from '@/lib/http'
import { eq, desc, sql } from 'drizzle-orm'

export async function GET(req?: NextRequest) {
  const { limit, offset } = parseListPagination(req)
  const rows = await db
    .select({
      id: software.id,
      name: software.name,
      jobCount: sql<number>`cast(count(${jobSoftware.jobId}) as int)`,
    })
    .from(software)
    .leftJoin(jobSoftware, eq(software.id, jobSoftware.softwareId))
    .groupBy(software.id, software.name)
    .orderBy(desc(sql`count(${jobSoftware.jobId})`), software.id)
    .limit(limit)
    .offset(offset)

  return NextResponse.json(rows)
}
