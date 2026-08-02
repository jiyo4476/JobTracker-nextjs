import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { requireAuth, readJsonBody, withErrorHandling } from '@/lib/http'
import { resumeVersionCreateSchema } from '@/lib/schemas'
import { logger } from '@/lib/logger'
import { resumeVersions } from '@/db/schema'
import { desc } from 'drizzle-orm'

export const GET = withErrorHandling('GET /api/resume-versions', async () => {
  const rows = await db.select().from(resumeVersions).orderBy(desc(resumeVersions.createdAt))
  return NextResponse.json(rows)
})

export const POST = withErrorHandling('POST /api/resume-versions', async (req: NextRequest) => {
  const denied = await requireAuth(req)
  if (denied) return denied

  const parsed = await readJsonBody(req, resumeVersionCreateSchema)
  if (!parsed.ok) return parsed.response

  const [row] = await db.insert(resumeVersions).values({
    label: parsed.data.label,
    date: parsed.data.date ?? null,
    notes: parsed.data.notes ?? null,
  }).returning()

  logger.info('resume version created', { id: row.id, label: row.label })
  return NextResponse.json(row, { status: 201 })
})
