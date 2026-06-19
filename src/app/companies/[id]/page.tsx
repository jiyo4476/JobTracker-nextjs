'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/layout/PageHeader'
import { useCompany, usePatchCompany } from '@/lib/queries'

function formatSalary(min: number | null, max: number | null) {
  if (!min && !max) return '—'
  const fmt = (c: number) => '$' + Math.round(c / 100000) + 'k'
  if (min && max) return `${fmt(min)} – ${fmt(max)}`
  return fmt((min ?? max)!)
}

const STAGE_COLORS: Record<string, string> = {
  not_applied: 'secondary',
  applied: 'default',
  phone_screen: 'default',
  technical_screen: 'default',
  onsite: 'default',
  offer_received: 'default',
  rejected: 'destructive',
  withdrawn: 'secondary',
}

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const companyId = Number(id)
  const { data: company, isLoading } = useCompany(companyId)
  const patch = usePatchCompany()

  function handleBlur(field: string, value: string) {
    patch.mutate({ id: companyId, [field]: value || null })
  }

  if (isLoading || !company) {
    return (
      <div className="p-8">
        <div className="mb-6">
          <Skeleton className="h-7 w-48 mb-2" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="grid grid-cols-3 gap-6">
          <Card>
            <CardHeader><CardTitle className="text-sm">Company Info</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {['Industry', 'Size', 'HQ', 'Website', 'LinkedIn', 'Glassdoor'].map(l => (
                <div key={l} className="flex justify-between">
                  <span className="text-slate-500">{l}</span>
                  <Skeleton className="h-4 w-28" />
                </div>
              ))}
            </CardContent>
          </Card>
          <div className="col-span-2">
            <Card>
              <CardHeader><CardTitle className="text-sm">Jobs at this Company</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 border border-slate-100 rounded-md">
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <PageHeader
        title={company.name}
        description={[company.industry, company.hqLocation].filter(Boolean).join(' · ')}
      />
      <div className="grid grid-cols-3 gap-6 mt-6">
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Company Info</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Industry</span>
                <span>{company.industry ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Size</span>
                <span>{company.size ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">HQ</span>
                <span>{company.hqLocation ?? '—'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Website</span>
                {company.website
                  ? <a href={company.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline">
                      <ExternalLink className="h-3 w-3" />Visit
                    </a>
                  : <span>—</span>}
              </div>
              <div className="space-y-1">
                <span className="text-slate-500">LinkedIn URL</span>
                <Input
                  defaultValue={company.linkedinUrl ?? ''}
                  placeholder="https://linkedin.com/company/..."
                  onBlur={e => handleBlur('linkedinUrl', e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-1">
                <span className="text-slate-500">Glassdoor URL</span>
                <Input
                  defaultValue={company.glassdoorUrl ?? ''}
                  placeholder="https://glassdoor.com/..."
                  onBlur={e => handleBlur('glassdoorUrl', e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Notes</CardTitle></CardHeader>
            <CardContent>
              <Textarea
                defaultValue={company.notes ?? ''}
                placeholder="Add notes about this company..."
                onBlur={e => handleBlur('notes', e.target.value)}
                className="min-h-[120px] text-sm resize-none"
              />
            </CardContent>
          </Card>
        </div>

        <div className="col-span-2">
          <Card>
            <CardHeader><CardTitle className="text-sm">Jobs at this Company</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {company.jobs.length === 0
                ? <p className="text-sm text-slate-500">No jobs tracked yet.</p>
                : company.jobs.map(job => (
                    <div key={job.id} className="flex items-center gap-3 p-2 border border-slate-100 rounded-md hover:bg-slate-50">
                      <Link href={`/jobs/${job.id}`} className="flex-1 text-sm text-blue-600 hover:underline font-medium">
                        {job.jobTitle}
                      </Link>
                      <Badge variant={(STAGE_COLORS[job.interviewStage] as 'default' | 'secondary' | 'destructive') ?? 'default'}>
                        {job.interviewStage.replace(/_/g, ' ')}
                      </Badge>
                      <span className="text-sm text-slate-500 w-28 text-right">
                        {formatSalary(job.salaryMin, job.salaryMax)}
                      </span>
                      <span className="text-xs text-slate-400 w-24 text-right">
                        {new Date(job.dateFound).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
