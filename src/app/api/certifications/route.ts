import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { db } from '@/db'
import { certifications, jobCertifications } from '@/db/schema'
import { parseListPagination } from '@/lib/http'
import { eq, desc, sql } from 'drizzle-orm'

export async function GET(req?: NextRequest) {
  const { limit, offset } = parseListPagination(req)
  const rows = await db
    .select({
      id: certifications.id,
      name: certifications.name,
      jobCount: sql<number>`cast(count(${jobCertifications.jobId}) as int)`,
    })
    .from(certifications)
    .leftJoin(jobCertifications, eq(certifications.id, jobCertifications.certificationId))
    .groupBy(certifications.id, certifications.name)
    .orderBy(desc(sql`count(${jobCertifications.jobId})`), certifications.id)
    .limit(limit)
    .offset(offset)

  return NextResponse.json(rows)
}
