import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { jobs } from '@/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const jobId = parseInt(id)
  if (isNaN(jobId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const [row] = await db
    .select({ id: jobs.id, jobDescription: jobs.jobDescription })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1)

  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ id: row.id, job_description: row.jobDescription })
}
