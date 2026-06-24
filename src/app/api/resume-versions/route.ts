import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { requireApiKey } from '@/lib/auth'
import { resumeVersionCreateSchema } from '@/lib/schemas'
import { logger } from '@/lib/logger'
import { resumeVersions } from '@/db/schema'
import { desc } from 'drizzle-orm'

export async function GET() {
  const rows = await db.select().from(resumeVersions).orderBy(desc(resumeVersions.createdAt))
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  if (!requireApiKey(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const parsed = resumeVersionCreateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  try {
    const [row] = await db.insert(resumeVersions).values({
      label: parsed.data.label,
      date: parsed.data.date ?? null,
      notes: parsed.data.notes ?? null,
    }).returning()

    logger.info('resume version created', { id: row.id, label: row.label })
    return NextResponse.json(row, { status: 201 })
  } catch (err) {
    logger.error('POST /api/resume-versions failed', { err: String(err) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
