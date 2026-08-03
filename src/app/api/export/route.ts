import { NextRequest, NextResponse } from 'next/server'
import { withUser } from '@/db/session'
import { resolveRequestUser } from '@/lib/resolved-user'
import { logger, serializeError } from '@/lib/logger'
import { jobs, companies, userJobState } from '@/db/schema'
import { and, desc, eq, isNull } from 'drizzle-orm'

const EXPORT_LIMIT = 10_000
const EXPORT_FORMATS = ['csv', 'json'] as const

export async function GET(req: NextRequest) {
  // API-013 (slice 2): the export is PERSONAL — it emits only the caller's tracked
  // user_job_state joined to global catalog facts. Requires a resolved interactive
  // user; response is private/no-store (never cached, never cross-user).
  const auth = await resolveRequestUser(req)
  if (!auth.ok) return auth.response
  const userId = auth.user.id

  const { searchParams } = new URL(req.url)
  const format = searchParams.get('format') ?? 'json'

  if (!(EXPORT_FORMATS as readonly string[]).includes(format)) {
    return NextResponse.json(
      { error: `Invalid format: expected one of ${EXPORT_FORMATS.join(', ')}` },
      { status: 400 },
    )
  }

  logger.info('export requested', { format })

  try {
    const rows = await withUser(userId, async (tx) =>
      tx
        .select({
          id: jobs.id,
          jobTitle: jobs.jobTitle,
          jobLink: jobs.jobLink,
          jobLocation: jobs.jobLocation,
          isRemote: jobs.isRemote,
          sourcePlatform: jobs.sourcePlatform,
          jobType: jobs.jobType,
          experienceLevel: jobs.experienceLevel,
          salaryMin: jobs.salaryMin,
          salaryMax: jobs.salaryMax,
          salaryText: jobs.salaryText,
          // Personal columns come from the caller's user_job_state overlay.
          hasApplied: userJobState.hasApplied,
          dateApplied: userJobState.dateApplied,
          interviewStage: userJobState.interviewStage,
          priority: userJobState.priority,
          notes: userJobState.notes,
          datePosted: jobs.datePosted,
          dateFound: jobs.dateFound,
          isActive: jobs.isActive,
          companyName: companies.name,
        })
        .from(userJobState)
        // Owner predicate pins user_id to the caller (defense in depth on RLS).
        // Only non-hidden tracked rows over still-active catalog jobs are exported.
        .innerJoin(jobs, eq(userJobState.jobId, jobs.id))
        .leftJoin(companies, eq(jobs.companyId, companies.id))
        .where(and(
          eq(userJobState.userId, userId),
          eq(userJobState.isHidden, false),
          eq(jobs.isActive, true),
          isNull(jobs.deletedAt),
        ))
        .orderBy(desc(jobs.dateFound))
        .limit(EXPORT_LIMIT),
    )

    if (format === 'csv') {
      const headers = [
        'id','jobTitle','companyName','jobLink','jobLocation','isRemote','sourcePlatform',
        'jobType','experienceLevel','salaryMin','salaryMax','salaryText','hasApplied',
        'dateApplied','interviewStage','datePosted','dateFound','isActive','priority','notes',
      ]
      const escape = (v: unknown) => {
        if (v == null) return ''
        let s = String(v)
        // Neutralize spreadsheet formula injection (Excel/Sheets)
        if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
      }
      const csvLines = [
        headers.join(','),
        ...rows.map(r => headers.map(h => escape(r[h as keyof typeof r])).join(',')),
      ]
      return new NextResponse(csvLines.join('\n'), {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename=jobs.csv',
          'X-Export-Limit': String(EXPORT_LIMIT),
          'Cache-Control': 'private, no-store',
        },
      })
    }

    const res = NextResponse.json(rows)
    res.headers.set('X-Export-Limit', String(EXPORT_LIMIT))
    res.headers.set('Cache-Control', 'private, no-store')
    return res
  } catch (err) {
    logger.error('GET /api/export failed', serializeError(err))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
