import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { certifications, keywords, skills, software } from '@/db/schema'
import { escapeLikePattern } from '@/lib/db-utils'
import { asc, ilike } from 'drizzle-orm'

const tagTables = {
  skills,
  software,
  keywords,
  certifications,
} as const

type TagType = keyof typeof tagTables

function normalizeTagType(value: string | null): TagType | null {
  if (value === 'skill' || value === 'skills') return 'skills'
  if (value === 'software') return 'software'
  if (value === 'keyword' || value === 'keywords') return 'keywords'
  if (value === 'certification' || value === 'certifications') return 'certifications'
  return null
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = normalizeTagType(searchParams.get('type'))
  if (!type) {
    return NextResponse.json({ error: 'Invalid tag type' }, { status: 400 })
  }

  const q = searchParams.get('q')?.trim().slice(0, 100)
  const table = tagTables[type]
  const rows = await db
    .select({ id: table.id, name: table.name })
    .from(table)
    .where(q ? ilike(table.name, `%${escapeLikePattern(q)}%`) : undefined)
    .orderBy(asc(table.name))
    .limit(20)

  return NextResponse.json(rows)
}
