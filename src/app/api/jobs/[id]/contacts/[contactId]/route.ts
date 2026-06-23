import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { requireApiKey } from '@/lib/auth'
import { contactPatchSchema } from '@/lib/schemas'
import { contacts } from '@/db/schema'
import { eq } from 'drizzle-orm'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; contactId: string }> }) {
  if (!requireApiKey(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, contactId } = await params
  const jobId = parseInt(id)
  const cId = parseInt(contactId)
  if (isNaN(jobId) || isNaN(cId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const parsed = contactPatchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const d = parsed.data

  const result = await db.update(contacts).set({
    ...(d.name !== undefined && { name: d.name }),
    ...(d.title !== undefined && { title: d.title }),
    ...(d.email !== undefined && { email: d.email }),
    ...(d.phone !== undefined && { phone: d.phone }),
    ...(d.linkedin_url !== undefined && { linkedinUrl: d.linkedin_url }),
    ...(d.role !== undefined && { role: d.role }),
    ...(d.contacted_at !== undefined && { contactedAt: d.contacted_at }),
    ...(d.notes !== undefined && { notes: d.notes }),
  }).where(eq(contacts.id, cId)).returning({ id: contacts.id })

  if (result.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; contactId: string }> }) {
  if (!requireApiKey(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, contactId } = await params
  const jobId = parseInt(id)
  const cId = parseInt(contactId)
  if (isNaN(jobId) || isNaN(cId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const result = await db.delete(contacts).where(eq(contacts.id, cId)).returning({ id: contacts.id })

  if (result.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}
