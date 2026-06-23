import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { requireApiKey } from '@/lib/auth'
import { resumeVersionPatchSchema } from '@/lib/schemas'
import { resumeVersions } from '@/db/schema'
import { eq } from 'drizzle-orm'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireApiKey(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const resumeVersionId = parseInt(id)
  if (isNaN(resumeVersionId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const parsed = resumeVersionPatchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const d = parsed.data
  const updated = await db.update(resumeVersions).set({
    ...(d.label !== undefined && { label: d.label }),
    ...(d.date !== undefined && { date: d.date }),
    ...(d.notes !== undefined && { notes: d.notes }),
  }).where(eq(resumeVersions.id, resumeVersionId)).returning({ id: resumeVersions.id })

  if (updated.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireApiKey(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const resumeVersionId = parseInt(id)
  if (isNaN(resumeVersionId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const deleted = await db.delete(resumeVersions).where(eq(resumeVersions.id, resumeVersionId)).returning()
  if (deleted.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ success: true })
}
