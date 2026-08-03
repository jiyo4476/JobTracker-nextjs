import { NextRequest, NextResponse } from 'next/server'
import { withUser } from '@/db/session'
import { readJsonBody, privateJson } from '@/lib/http'
import { resolveRequestUser } from '@/lib/resolved-user'
import { jobStatePutSchema, jobStatePatchSchema } from '@/lib/schemas'
import { logger, serializeError } from '@/lib/logger'
import { jobs, userJobState, userJobStatusHistory, resumeVersions } from '@/db/schema'
import { eq, and, isNull, sql } from 'drizzle-orm'
import type { z } from 'zod'

type StatePutBody = z.infer<typeof jobStatePutSchema>

// Column defaults used when a PUT (replace) or a first-time PATCH (create) omits a field.
// Mirrors the user_job_state column defaults so "replace" is a full, well-defined row.
const STATE_DEFAULTS = {
  priority: null as number | null,
  isHidden: false,
  hasApplied: false,
  dateApplied: null as string | null,
  heardBack: false,
  interviewStage: 'not_applied' as StatePutBody['interview_stage'] & string,
  referral: false,
  coverLetterSubmitted: false,
  resumeVersionId: null as number | null,
  rejectionReason: null as string | null,
  notes: null as string | null,
}

// Map validated snake_case body fields to the drizzle column object, applying the
// date '' → null convention. Only keys PRESENT in the body are emitted, so PATCH can
// distinguish "omitted" from "explicit null".
function toColumns(body: Partial<StatePutBody>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if ('priority' in body) out.priority = body.priority ?? null
  if ('is_hidden' in body) out.isHidden = body.is_hidden
  if ('has_applied' in body) out.hasApplied = body.has_applied
  if ('date_applied' in body) out.dateApplied = body.date_applied ? body.date_applied : null
  if ('heard_back' in body) out.heardBack = body.heard_back
  if ('interview_stage' in body) out.interviewStage = body.interview_stage
  if ('referral' in body) out.referral = body.referral
  if ('cover_letter_submitted' in body) out.coverLetterSubmitted = body.cover_letter_submitted
  if ('resume_version_id' in body) out.resumeVersionId = body.resume_version_id ?? null
  if ('rejection_reason' in body) out.rejectionReason = body.rejection_reason ?? null
  if ('notes' in body) out.notes = body.notes ?? null
  return out
}

type Tx = Parameters<Parameters<typeof withUser>[1]>[0]

const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 })

// Shared upsert used by both PUT (replace) and PATCH (merge). `replace` decides
// whether omitted fields reset to defaults (PUT) or are left untouched (PATCH).
async function upsertState(
  tx: Tx,
  userId: number,
  jobId: number,
  provided: Record<string, unknown>,
  replace: boolean,
) {
  // Read prior state under the owner predicate — for stage-history diffing and to
  // know whether this is a create or an update.
  const [prior] = await tx
    .select({ interviewStage: userJobState.interviewStage })
    .from(userJobState)
    .where(and(eq(userJobState.userId, userId), eq(userJobState.jobId, jobId)))
    .limit(1)

  const insertValues = {
    userId,
    jobId,
    ...STATE_DEFAULTS,
    ...provided,
  }

  const updateSet = replace
    ? { ...STATE_DEFAULTS, ...provided, updatedAt: sql`now()` }
    : { ...provided, updatedAt: sql`now()` }

  const [row] = await tx
    .insert(userJobState)
    .values(insertValues)
    .onConflictDoUpdate({
      target: [userJobState.userId, userJobState.jobId],
      set: updateSet,
    })
    .returning()

  // Stage history: append only when the effective stage actually changed. On create
  // (no prior row) the "from" stage is null.
  const priorStage = prior?.interviewStage ?? null
  const newStage = row.interviewStage
  if (newStage !== (priorStage ?? STATE_DEFAULTS.interviewStage)) {
    await tx.insert(userJobStatusHistory).values({
      userId,
      jobId,
      fromStage: priorStage,
      toStage: newStage,
    })
  }

  return row
}

// Verify the catalog job exists and is active. A missing OR soft-deleted job yields
// the SAME non-disclosing 404 as an untracked/wrong-owner reference.
async function activeCatalogJobExists(tx: Tx, jobId: number): Promise<boolean> {
  const [job] = await tx
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.isActive, true), isNull(jobs.deletedAt)))
    .limit(1)
  return Boolean(job)
}

// If a resume_version_id is supplied (non-null), it must belong to THIS user.
async function resumeBelongsToUser(tx: Tx, userId: number, resumeVersionId: number): Promise<boolean> {
  const [row] = await tx
    .select({ id: resumeVersions.id })
    .from(resumeVersions)
    .where(and(eq(resumeVersions.id, resumeVersionId), eq(resumeVersions.userId, userId)))
    .limit(1)
  return Boolean(row)
}

async function handleUpsert(
  req: NextRequest,
  paramsPromise: Promise<{ id: string }>,
  replace: boolean,
) {
  const auth = await resolveRequestUser(req)
  if (!auth.ok) return auth.response
  const userId = auth.user.id

  const { id } = await paramsPromise
  const jobId = parseInt(id)
  if (isNaN(jobId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const parsed = await readJsonBody(req, replace ? jobStatePutSchema : jobStatePatchSchema)
  if (!parsed.ok) return parsed.response
  const provided = toColumns(parsed.data)

  try {
    const result = await withUser(userId, async (tx) => {
      if (!(await activeCatalogJobExists(tx, jobId))) return { status: 404 as const }

      const resumeId = provided.resumeVersionId
      if (typeof resumeId === 'number' && !(await resumeBelongsToUser(tx, userId, resumeId))) {
        return { status: 400 as const }
      }

      const row = await upsertState(tx, userId, jobId, provided, replace)
      return { status: 200 as const, row }
    })

    if (result.status === 404) return notFound()
    if (result.status === 400) {
      return NextResponse.json({ error: 'Invalid resume_version_id' }, { status: 400 })
    }
    logger.info('job state upserted', { jobId, replace, fields: Object.keys(parsed.data) })
    return privateJson(result.row)
  } catch (err) {
    logger.error('PUT/PATCH /api/jobs/[id]/state failed', { jobId, ...serializeError(err) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleUpsert(req, params, true)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleUpsert(req, params, false)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // "Remove from my tracker" — NOT a global/catalog deletion. Owner-predicated delete;
  // contacts and status history cascade via their ON DELETE CASCADE state FKs.
  const auth = await resolveRequestUser(req)
  if (!auth.ok) return auth.response
  const userId = auth.user.id

  const { id } = await params
  const jobId = parseInt(id)
  if (isNaN(jobId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  try {
    const deleted = await withUser(userId, async (tx) => {
      return tx
        .delete(userJobState)
        .where(and(eq(userJobState.userId, userId), eq(userJobState.jobId, jobId)))
        .returning({ jobId: userJobState.jobId })
    })

    // Missing job, untracked job, and a wrong-owner id are indistinguishable here.
    if (deleted.length === 0) return notFound()

    logger.info('job state removed from tracker', { jobId })
    return privateJson({ success: true })
  } catch (err) {
    logger.error('DELETE /api/jobs/[id]/state failed', { jobId, ...serializeError(err) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
