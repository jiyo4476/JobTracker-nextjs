import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { db } from '@/db'
import { skills, jobSkills } from '@/db/schema'
import { parseListPagination } from '@/lib/http'
import { eq, desc, sql } from 'drizzle-orm'

export async function GET(req?: NextRequest) {
  const { limit, offset } = parseListPagination(req)
  const rows = await db
    .select({
      id: skills.id,
      name: skills.name,
      jobCount: sql<number>`cast(count(${jobSkills.jobId}) as int)`,
    })
    .from(skills)
    .leftJoin(jobSkills, eq(skills.id, jobSkills.skillId))
    .groupBy(skills.id, skills.name)
    .orderBy(desc(sql`count(${jobSkills.jobId})`), skills.id)
    .limit(limit)
    .offset(offset)

  return NextResponse.json(rows)
}
