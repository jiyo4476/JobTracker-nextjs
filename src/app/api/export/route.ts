import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { requireApiKey } from '@/lib/auth'
import { jobs, companies } from '@/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  if (!requireApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const format = searchParams.get('format') ?? 'json'

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
      },
    })
  }

  return NextResponse.json(rows)
}
