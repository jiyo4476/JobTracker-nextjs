import { NextRequest, NextResponse } from 'next/server'
import { readJsonBody, withErrorHandling, privateJson } from '@/lib/http'
import { resumeVersionPatchSchema } from '@/lib/schemas'
import { logger } from '@/lib/logger'
import { resumeVersions } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { resolveRequestUser } from '@/lib/resolved-user'
import { withUser } from '@/db/session'

export const PATCH = withErrorHandling(
  'PATCH /api/resume-versions/[id]',
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const auth = await resolveRequestUser(req)
    if (!auth.ok) return auth.response

    const { id } = await params
    const resumeVersionId = parseInt(id)
    if (isNaN(resumeVersionId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const parsed = await readJsonBody(req, resumeVersionPatchSchema)
    if (!parsed.ok) return parsed.response

    const d = parsed.data
    // Standard update contract: 200 with the updated row.
    const [updated] = await withUser(auth.user.id, (tx) => tx.update(resumeVersions).set({
      ...(d.label !== undefined && { label: d.label }),
      ...(d.date !== undefined && { date: d.date }),
      ...(d.notes !== undefined && { notes: d.notes }),
    }).where(and(eq(resumeVersions.userId, auth.user.id), eq(resumeVersions.id, resumeVersionId))).returning())

    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    logger.info('resume version updated', { resumeVersionId })
    return privateJson(updated)
  },
)

export const DELETE = withErrorHandling(
  'DELETE /api/resume-versions/[id]',
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const auth = await resolveRequestUser(req)
    if (!auth.ok) return auth.response

    const { id } = await params
    const resumeVersionId = parseInt(id)
    if (isNaN(resumeVersionId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const deleted = await withUser(auth.user.id, (tx) => tx.delete(resumeVersions)
      .where(and(eq(resumeVersions.userId, auth.user.id), eq(resumeVersions.id, resumeVersionId))).returning())
    if (deleted.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    logger.info('resume version deleted', { resumeVersionId })
    return privateJson({ success: true })
  },
)
