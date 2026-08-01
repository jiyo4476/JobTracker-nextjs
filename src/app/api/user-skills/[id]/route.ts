import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { requireAuth } from '@/lib/http'
import { userSkills } from '@/db/schema'
import { logger } from '@/lib/logger'
import { eq } from 'drizzle-orm'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth(req)
  if (denied) return denied

  const { id } = await params
  const skillId = parseInt(id)
  if (isNaN(skillId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const deleted = await db
    .delete(userSkills)
    .where(eq(userSkills.skillId, skillId))
    .returning()

  if (deleted.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  logger.info('user skill removed', { skillId })
  return NextResponse.json({ success: true })
}
