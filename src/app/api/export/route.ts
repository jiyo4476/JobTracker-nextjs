import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { requireAuth } from '@/lib/http'
import { logger, serializeError } from '@/lib/logger'
import { jobs, companies } from '@/db/schema'
import { and, desc, eq, isNull } from 'drizzle-orm'

const EXPORT_LIMIT = 10_000
const EXPORT_FORMATS = ['csv', 'json'] as const

export async function GET(req: NextRequest) {
  const denied = await requireAuth(req)
  if (denied) return denied
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
    const rows = await db
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
        hasApplied: jobs.hasApplied,
        dateApplied: jobs.dateApplied,
        interviewStage: jobs.interviewStage,
        datePosted: jobs.datePosted,
        dateFound: jobs.dateFound,
        isActive: jobs.isActive,
        priority: jobs.priority,
        notes: jobs.notes,
        companyName: companies.name,
      })
      .from(jobs)
      .leftJoin(companies, eq(jobs.companyId, companies.id))
      // Exclude soft-deleted jobs, matching every other read (e.g. GET /api/jobs).
      // Without this, jobs hidden by DELETE /api/jobs/[id] leaked into exports.
      .where(and(eq(jobs.isActive, true), isNull(jobs.deletedAt)))
      .orderBy(desc(jobs.dateFound))
      .limit(EXPORT_LIMIT)

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
        },
      })
    }

    const res = NextResponse.json(rows)
    res.headers.set('X-Export-Limit', String(EXPORT_LIMIT))
    return res
  } catch (err) {
    logger.error('GET /api/export failed', serializeError(err))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
