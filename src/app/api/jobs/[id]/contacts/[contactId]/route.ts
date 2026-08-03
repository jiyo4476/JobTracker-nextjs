import { NextRequest, NextResponse } from 'next/server'
import { withUser } from '@/db/session'
import { readJsonBody, privateJson } from '@/lib/http'
import { resolveRequestUser } from '@/lib/resolved-user'
import { contactPatchSchema } from '@/lib/schemas'
import { logger, serializeError } from '@/lib/logger'
import { userJobContacts } from '@/db/schema'
import { and, eq } from 'drizzle-orm'

const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 })

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> },
) {
  // API-013 slice 3: owner-scoped update. The predicate pins user_id (caller), job_id,
  // AND contact id — so a wrong-owner or wrong-job contact id is indistinguishable
  // from a missing one (non-disclosing 404).
  const auth = await resolveRequestUser(req)
  if (!auth.ok) return auth.response
  const userId = auth.user.id

  const { id, contactId } = await params
  const jobId = parseInt(id)
  const cId = parseInt(contactId)
  if (isNaN(jobId) || isNaN(cId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const parsed = await readJsonBody(req, contactPatchSchema)
  if (!parsed.ok) return parsed.response
  const d = parsed.data

  try {
    const result = await withUser(userId, (tx) =>
      tx
        .update(userJobContacts)
        .set({
          ...(d.name !== undefined && { name: d.name }),
          ...(d.title !== undefined && { title: d.title }),
          ...(d.email !== undefined && { email: d.email }),
          ...(d.phone !== undefined && { phone: d.phone }),
          ...(d.linkedin_url !== undefined && { linkedinUrl: d.linkedin_url }),
          ...(d.role !== undefined && { role: d.role }),
          ...(d.contacted_at !== undefined && { contactedAt: d.contacted_at }),
          ...(d.notes !== undefined && { notes: d.notes }),
        })
        .where(
          and(
            eq(userJobContacts.id, cId),
            eq(userJobContacts.userId, userId),
            eq(userJobContacts.jobId, jobId),
          ),
        )
        .returning({ id: userJobContacts.id }),
    )

    if (result.length === 0) return notFound()
    logger.info('contact updated', { contactId: cId, jobId })
    return privateJson({ success: true })
  } catch (err) {
    logger.error('PATCH /api/jobs/[id]/contacts/[contactId] failed', {
      contactId: cId,
      jobId,
      ...serializeError(err),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> },
) {
  const auth = await resolveRequestUser(req)
  if (!auth.ok) return auth.response
  const userId = auth.user.id

  const { id, contactId } = await params
  const jobId = parseInt(id)
  const cId = parseInt(contactId)
  if (isNaN(jobId) || isNaN(cId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  try {
    const result = await withUser(userId, (tx) =>
      tx
        .delete(userJobContacts)
        .where(
          and(
            eq(userJobContacts.id, cId),
            eq(userJobContacts.userId, userId),
            eq(userJobContacts.jobId, jobId),
          ),
        )
        .returning({ id: userJobContacts.id }),
    )

    if (result.length === 0) return notFound()
    logger.info('contact deleted', { contactId: cId, jobId })
    return privateJson({ success: true })
  } catch (err) {
    logger.error('DELETE /api/jobs/[id]/contacts/[contactId] failed', {
      contactId: cId,
      jobId,
      ...serializeError(err),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
