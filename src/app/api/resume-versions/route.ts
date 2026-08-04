import { NextRequest } from 'next/server'
import { readJsonBody, withErrorHandling, privateJson } from '@/lib/http'
import { resumeVersionCreateSchema } from '@/lib/schemas'
import { logger } from '@/lib/logger'
import { resumeVersions } from '@/db/schema'
import { desc, eq } from 'drizzle-orm'
import { resolveRequestUser } from '@/lib/resolved-user'
import { withUser } from '@/db/session'

export const GET = withErrorHandling('GET /api/resume-versions', async (req: NextRequest) => {
  // Resume versions are user-owned data, so reads are gated for consistency with
  // the other user-owned reads (user-skills, user-taxonomies) — same-origin browser
  // calls pass; header-less non-same-origin callers get 401.
  const auth = await resolveRequestUser(req)
  if (!auth.ok) return auth.response

  const rows = await withUser(auth.user.id, (tx) => tx.select().from(resumeVersions)
    .where(eq(resumeVersions.userId, auth.user.id)).orderBy(desc(resumeVersions.createdAt)))
  return privateJson(rows)
})

export const POST = withErrorHandling('POST /api/resume-versions', async (req: NextRequest) => {
  const auth = await resolveRequestUser(req)
  if (!auth.ok) return auth.response

  const parsed = await readJsonBody(req, resumeVersionCreateSchema)
  if (!parsed.ok) return parsed.response

  const [row] = await withUser(auth.user.id, (tx) => tx.insert(resumeVersions).values({
    userId: auth.user.id,
    label: parsed.data.label,
    date: parsed.data.date ?? null,
    notes: parsed.data.notes ?? null,
  }).returning())

  logger.info('resume version created', { id: row.id, label: row.label })
  return privateJson(row, { status: 201 })
})
