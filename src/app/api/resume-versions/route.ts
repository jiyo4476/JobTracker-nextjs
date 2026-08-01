import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { requireAuth, readJsonBody } from '@/lib/http'
import { resumeVersionCreateSchema } from '@/lib/schemas'
import { logger, serializeError } from '@/lib/logger'
import { resumeVersions } from '@/db/schema'
import { desc } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  // Resume versions are user-owned data, so reads are gated for consistency with
  // the other user-owned reads (user-skills, user-taxonomies) — same-origin browser
  // calls pass; header-less non-same-origin callers get 401.
  const denied = await requireAuth(req)
  if (denied) return denied

  const rows = await db.select().from(resumeVersions).orderBy(desc(resumeVersions.createdAt))
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth(req)
  if (denied) return denied

  const parsed = await readJsonBody(req, resumeVersionCreateSchema)
  if (!parsed.ok) return parsed.response

  try {
    const [row] = await db.insert(resumeVersions).values({
      label: parsed.data.label,
      date: parsed.data.date ?? null,
      notes: parsed.data.notes ?? null,
    }).returning()

    logger.info('resume version created', { id: row.id, label: row.label })
    return NextResponse.json(row, { status: 201 })
  } catch (err) {
    logger.error('POST /api/resume-versions failed', serializeError(err))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
