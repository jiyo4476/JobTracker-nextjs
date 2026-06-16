import { NextResponse } from 'next/server'
import { db } from '@/db'
import { skills, jobSkills } from '@/db/schema'
import { eq, desc, sql } from 'drizzle-orm'

export async function GET() {
  const rows = await db
    .select({
      id: skills.id,
      name: skills.name,
      jobCount: sql<number>`cast(count(${jobSkills.jobId}) as int)`,
    })
    .from(skills)
    .leftJoin(jobSkills, eq(skills.id, jobSkills.skillId))
    .groupBy(skills.id, skills.name)
    .orderBy(desc(sql`count(${jobSkills.jobId})`))

  return NextResponse.json(rows)
}
