import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { requireApiKey } from '@/lib/auth'
import { userSkillCreateSchema } from '@/lib/schemas'
import { userSkills, skills } from '@/db/schema'
import { eq } from 'drizzle-orm'

export async function GET() {
  const rows = await db
    .select({
      skillId: userSkills.skillId,
      name: skills.name,
      hasSkill: userSkills.hasSkill,
    })
    .from(userSkills)
    .innerJoin(skills, eq(userSkills.skillId, skills.id))
    .orderBy(skills.name)

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  if (!requireApiKey(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const parsed = userSkillCreateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const d = parsed.data

  let skillId: number

  if (d.name !== undefined) {
    // Upsert into skills by name
    const [skill] = await db
      .insert(skills)
      .values({ name: d.name })
      .onConflictDoUpdate({ target: skills.name, set: { name: d.name } })
      .returning({ id: skills.id })
    skillId = skill.id
  } else {
    skillId = d.skill_id!
  }

  await db
    .insert(userSkills)
    .values({ skillId, hasSkill: false })
    .onConflictDoNothing()

  return NextResponse.json({ success: true, skillId }, { status: 201 })
}
