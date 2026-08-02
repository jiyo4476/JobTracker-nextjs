import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { requireAuth, readJsonBody, withErrorHandling } from '@/lib/http'
import { resumeVersionCreateSchema } from '@/lib/schemas'
import { logger } from '@/lib/logger'
import { resumeVersions } from '@/db/schema'
import { desc } from 'drizzle-orm'

export const GET = withErrorHandling('GET /api/resume-versions', async (req: NextRequest) => {
  // Resume versions are user-owned data, so reads are gated for consistency with
  // the other user-owned reads (user-skills, user-taxonomies) — same-origin browser
  // calls pass; header-less non-same-origin callers get 401.
  const authError = await requireAuth(req)
  if (authError) return authError

  const rows = await db.select().from(resumeVersions).orderBy(desc(resumeVersions.createdAt))
  return NextResponse.json(rows)
})

export const POST = withErrorHandling('POST /api/resume-versions', async (req: NextRequest) => {
  const authError = await requireAuth(req)
  if (authError) return authError

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
