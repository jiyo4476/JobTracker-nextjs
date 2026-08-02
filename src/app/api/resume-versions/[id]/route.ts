import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { requireAuth, readJsonBody, withErrorHandling } from '@/lib/http'
import { resumeVersionPatchSchema } from '@/lib/schemas'
import { logger } from '@/lib/logger'
import { resumeVersions } from '@/db/schema'
import { eq } from 'drizzle-orm'

export const PATCH = withErrorHandling(
  'PATCH /api/resume-versions/[id]',
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const denied = await requireAuth(req)
    if (denied) return denied

    const { id } = await params
    const resumeVersionId = parseInt(id)
    if (isNaN(resumeVersionId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const parsed = await readJsonBody(req, resumeVersionPatchSchema)
    if (!parsed.ok) return parsed.response

    const d = parsed.data
    // Standard update contract: 200 with the updated row.
    const [updated] = await db.update(resumeVersions).set({
      ...(d.label !== undefined && { label: d.label }),
      ...(d.date !== undefined && { date: d.date }),
      ...(d.notes !== undefined && { notes: d.notes }),
    }).where(eq(resumeVersions.id, resumeVersionId)).returning()

    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    logger.info('resume version updated', { resumeVersionId })
    return NextResponse.json(updated)
  },
)

export const DELETE = withErrorHandling(
  'DELETE /api/resume-versions/[id]',
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const denied = await requireAuth(req)
    if (denied) return denied

    const { id } = await params
    const resumeVersionId = parseInt(id)
    if (isNaN(resumeVersionId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const deleted = await db.delete(resumeVersions).where(eq(resumeVersions.id, resumeVersionId)).returning()
    if (deleted.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    logger.info('resume version deleted', { resumeVersionId })
    return NextResponse.json({ success: true })
  },
)
