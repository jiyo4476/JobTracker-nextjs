import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { certifications, keywords, skills, software } from '@/db/schema'
import { escapeLikePattern } from '@/lib/db-utils'
import { logger, serializeError } from '@/lib/logger'
import { asc, ilike, inArray } from 'drizzle-orm'

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

function parseTagIds(value: string | null) {
  if (value === null) return { success: true as const, ids: [] }
  const tokens = value.split(',').map(token => token.trim())
  if (
    tokens.some(token => !/^\d+$/.test(token)) ||
    tokens.some(token => {
      const id = Number(token)
      return !Number.isSafeInteger(id) || id <= 0
    })
  ) {
    return { success: false as const, error: 'Invalid ids: expected comma-separated positive integers' }
  }

  const ids = [...new Set(tokens.map(Number))]
  if (ids.length > 100) return { success: false as const, error: 'Invalid ids: at most 100 IDs are allowed' }
  return { success: true as const, ids }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const type = normalizeTagType(searchParams.get('type'))
    if (!type) {
      return NextResponse.json({ error: 'Invalid tag type' }, { status: 400 })
    }

    const q = searchParams.get('q')?.trim().slice(0, 100)
    const parsedIds = parseTagIds(searchParams.get('ids'))
    if (!parsedIds.success) {
      return NextResponse.json({ error: parsedIds.error }, { status: 400 })
    }
    const table = tagTables[type]
    const where = parsedIds.ids.length > 0
      ? inArray(table.id, parsedIds.ids)
      : q
        ? ilike(table.name, `%${escapeLikePattern(q)}%`)
        : undefined
    const rows = await db
      .select({ id: table.id, name: table.name })
      .from(table)
      .where(where)
      .orderBy(asc(table.name))
      .limit(parsedIds.ids.length > 0 ? parsedIds.ids.length : 20)

    return NextResponse.json(rows)
  } catch (err) {
    logger.error('GET /api/tags failed', serializeError(err))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
