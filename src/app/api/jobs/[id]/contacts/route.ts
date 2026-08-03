import { NextRequest, NextResponse } from 'next/server'
import { withUser } from '@/db/session'
import { readJsonBody, privateJson } from '@/lib/http'
import { resolveRequestUser } from '@/lib/resolved-user'
import { contactCreateSchema } from '@/lib/schemas'
import { logger, serializeError } from '@/lib/logger'
import { jobs, userJobState, userJobContacts } from '@/db/schema'
import { eq, and, asc, isNull } from 'drizzle-orm'

type Tx = Parameters<Parameters<typeof withUser>[1]>[0]

const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 })

// The SAME non-disclosing 404 used across API-013: a missing catalog job, a
// soft-deleted job, and a wrong-owner reference are indistinguishable to the caller.
async function activeCatalogJobExists(tx: Tx, jobId: number): Promise<boolean> {
  const [job] = await tx
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.isActive, true), isNull(jobs.deletedAt)))
    .limit(1)
  return Boolean(job)
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // API-013 slice 3: contacts are per-user overlay rows carrying PII (email/phone).
  // Requires a resolved interactive user; every predicate pins the caller's user_id
  // AND the job_id, so no user can ever read another user's contacts. Never cached.
  const auth = await resolveRequestUser(req)
  if (!auth.ok) return auth.response
  const userId = auth.user.id

  const { id } = await params
  const jobId = parseInt(id)
  if (isNaN(jobId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  try {
    const rows = await withUser(userId, (tx) =>
      tx
        .select({
          id: userJobContacts.id,
          name: userJobContacts.name,
          title: userJobContacts.title,
          email: userJobContacts.email,
          phone: userJobContacts.phone,
          linkedinUrl: userJobContacts.linkedinUrl,
          role: userJobContacts.role,
          contactedAt: userJobContacts.contactedAt,
          notes: userJobContacts.notes,
          createdAt: userJobContacts.createdAt,
        })
        .from(userJobContacts)
        .where(and(eq(userJobContacts.userId, userId), eq(userJobContacts.jobId, jobId)))
        .orderBy(asc(userJobContacts.createdAt)),
    )

    // Untracked/missing job → the caller simply owns no contacts here (empty list),
    // which is non-disclosing about whether the catalog job exists.
    return privateJson(rows)
  } catch (err) {
    logger.error('GET /api/jobs/[id]/contacts failed', { jobId, ...serializeError(err) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveRequestUser(req)
  if (!auth.ok) return auth.response
  const userId = auth.user.id

  const { id } = await params
  const jobId = parseInt(id)
  if (isNaN(jobId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const parsed = await readJsonBody(req, contactCreateSchema)
  if (!parsed.ok) return parsed.response
  const d = parsed.data

  try {
    const result = await withUser(userId, async (tx) => {
      // A missing/soft-deleted catalog job yields the same non-disclosing 404.
      if (!(await activeCatalogJobExists(tx, jobId))) return { status: 404 as const }

      // user_job_contacts has a composite FK (user_id, job_id) → user_job_state, so a
      // contact can only exist if the caller already tracks this job. Creating a
      // contact therefore transactionally materializes an otherwise-default state row
      // for this (user, job) when none exists. A default create introduces no stage
      // change (stage stays 'not_applied'), so — mirroring the /state route — no
      // status-history row is emitted here.
      await tx
        .insert(userJobState)
        .values({ userId, jobId })
        .onConflictDoNothing({ target: [userJobState.userId, userJobState.jobId] })

      const [row] = await tx
        .insert(userJobContacts)
        .values({
          userId,
          jobId,
          name: d.name,
          ...(d.title !== undefined && { title: d.title }),
          ...(d.email !== undefined && { email: d.email }),
          ...(d.phone !== undefined && { phone: d.phone }),
          ...(d.linkedin_url !== undefined && { linkedinUrl: d.linkedin_url }),
          ...(d.role !== undefined && { role: d.role }),
          ...(d.contacted_at !== undefined && { contactedAt: d.contacted_at }),
          ...(d.notes !== undefined && { notes: d.notes }),
        })
        .returning()

      return { status: 201 as const, row }
    })

    if (result.status === 404) return notFound()

    logger.info('contact created', { contactId: result.row.id, jobId })
    return privateJson(result.row, { status: 201 })
  } catch (err) {
    logger.error('POST /api/jobs/[id]/contacts failed', { jobId, ...serializeError(err) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
