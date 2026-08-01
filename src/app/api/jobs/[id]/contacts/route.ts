import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { requireAuth, readJsonBody } from '@/lib/http'
import { contactCreateSchema } from '@/lib/schemas'
import { logger, serializeError } from '@/lib/logger'
import { contacts } from '@/db/schema'
import { eq, asc } from 'drizzle-orm'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const jobId = parseInt(id)
  if (isNaN(jobId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const rows = await db
    .select()
    .from(contacts)
    .where(eq(contacts.jobId, jobId))
    .orderBy(asc(contacts.createdAt))

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth(req)
  if (denied) return denied

  const { id } = await params
  const jobId = parseInt(id)
  if (isNaN(jobId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const parsed = await readJsonBody(req, contactCreateSchema)
  if (!parsed.ok) return parsed.response

  const d = parsed.data

  try {
    const [row] = await db.insert(contacts).values({
      jobId,
      name: d.name,
      ...(d.title !== undefined && { title: d.title }),
      ...(d.email !== undefined && { email: d.email }),
      ...(d.phone !== undefined && { phone: d.phone }),
      ...(d.linkedin_url !== undefined && { linkedinUrl: d.linkedin_url }),
      ...(d.role !== undefined && { role: d.role }),
      ...(d.contacted_at !== undefined && { contactedAt: d.contacted_at }),
      ...(d.notes !== undefined && { notes: d.notes }),
    }).returning()

    logger.info('contact created', { contactId: row.id, jobId })
    return NextResponse.json(row, { status: 201 })
  } catch (err) {
    logger.error('POST /api/jobs/[id]/contacts failed', { jobId, ...serializeError(err) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
