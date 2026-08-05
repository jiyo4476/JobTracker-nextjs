import { NextRequest, NextResponse } from 'next/server'
import { privateJson, withErrorHandling } from '@/lib/http'
import { userSkills } from '@/db/schema'
import { logger } from '@/lib/logger'
import { and, eq } from 'drizzle-orm'
import { resolveRequestUser } from '@/lib/resolved-user'
import { withUser } from '@/db/session'

export const DELETE = withErrorHandling(
  'DELETE /api/user-skills/[id]',
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const auth = await resolveRequestUser(req)
    if (!auth.ok) return auth.response

    const { id } = await params
    const skillId = parseInt(id)
    if (isNaN(skillId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const deleted = await withUser(auth.user.id, (tx) => tx
      .delete(userSkills)
      .where(and(eq(userSkills.userId, auth.user.id), eq(userSkills.skillId, skillId)))
      .returning())

    if (deleted.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    logger.info('user skill removed', { skillId })
    return privateJson({ success: true })
  },
)
