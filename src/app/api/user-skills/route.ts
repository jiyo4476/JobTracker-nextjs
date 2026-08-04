import { NextRequest } from 'next/server'
import { readJsonBody, withErrorHandling, privateJson } from '@/lib/http'
import { userSkillCreateSchema } from '@/lib/schemas'
import { logger } from '@/lib/logger'
import { userSkills, skills } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { resolveRequestUser } from '@/lib/resolved-user'
import { withUser } from '@/db/session'

export const GET = withErrorHandling('GET /api/user-skills', async (req: NextRequest) => {
  const auth = await resolveRequestUser(req)
  if (!auth.ok) return auth.response

  const rows = await withUser(auth.user.id, (tx) => tx
    .select({
      skillId: userSkills.skillId,
      name: skills.name,
      hasSkill: userSkills.hasSkill,
    })
    .from(userSkills)
    .innerJoin(skills, eq(userSkills.skillId, skills.id))
    .where(eq(userSkills.userId, auth.user.id))
    .orderBy(skills.name)
  )

  return privateJson(rows)
})

export const POST = withErrorHandling('POST /api/user-skills', async (req: NextRequest) => {
  const auth = await resolveRequestUser(req)
  if (!auth.ok) return auth.response

  const parsed = await readJsonBody(req, userSkillCreateSchema)
  if (!parsed.ok) return parsed.response

  const d = parsed.data

  let skillId: number

  if (d.name !== undefined) {
    const name = d.name
    // Upsert into skills by name
    const [skill] = await withUser(auth.user.id, (tx) => tx
      .insert(skills)
      .values({ name })
      .onConflictDoUpdate({ target: skills.name, set: { name } })
      .returning({ id: skills.id }))
    skillId = skill.id
  } else {
    skillId = d.skill_id!
  }

  await withUser(auth.user.id, (tx) => tx
    .insert(userSkills)
    .values({ userId: auth.user.id, skillId, hasSkill: false })
    .onConflictDoNothing({ target: [userSkills.userId, userSkills.skillId] }))

  logger.info('user skill added', { skillId })
  return privateJson({ success: true, skillId }, { status: 201 })
})
