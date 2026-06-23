import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { requireApiKey } from '@/lib/auth'
import { contactCreateSchema } from '@/lib/schemas'
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
  if (!requireApiKey(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const jobId = parseInt(id)
  if (isNaN(jobId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const parsed = contactCreateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const d = parsed.data

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

  return NextResponse.json(row, { status: 201 })
}
