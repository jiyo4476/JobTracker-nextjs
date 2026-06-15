import { NextResponse } from 'next/server'
import { db } from '@/db'
import { software, jobSoftware } from '@/db/schema'
import { eq, desc, sql } from 'drizzle-orm'

export async function GET() {
  const rows = await db
    .select({
      id: software.id,
      name: software.name,
      jobCount: sql<number>`cast(count(${jobSoftware.jobId}) as int)`,
    })
    .from(software)
    .leftJoin(jobSoftware, eq(software.id, jobSoftware.softwareId))
    .groupBy(software.id, software.name)
    .orderBy(desc(sql`count(${jobSoftware.jobId})`))

  return NextResponse.json(rows)
}
