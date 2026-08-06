'use client'

import React from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/layout/PageHeader'
import { AdminGuard } from '@/components/admin/AdminGuard'
import { JobSalaryInlineEditor } from '@/components/jobs/JobSalaryInlineEditor'
import { JobTaxonomyCard } from '@/components/jobs/JobTaxonomyCard'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  useJob,
  useCompanies,
  usePatchCatalogJob,
  useDeleteJob,
  type JobDetail,
} from '@/lib/queries'
import { jobCatalogPatchSchema } from '@/lib/schemas'
import { jobTypeOptions as JOB_TYPES, experienceLevelOptions as EXPERIENCE_LEVELS } from '@/lib/enums'

/**
 * PAGE-017 — the admin catalog editor.
 *
 * `/jobs/[id]/edit` is the PERSONAL application editor and writes only
 * `/api/jobs/[id]/state`. Shared catalog facts (title, company, description, location,
 * type/level, dates, clearance, global active flag, salary, taxonomy) are edited here
 * and nowhere else, so a single form never mixes catalog and personal fields.
 *
 * The payload is validated with the SAME `jobCatalogPatchSchema` the route handler uses
 * — there is no parallel client schema. Because that schema is `.strict()`, a personal
 * field can never be smuggled through this form; it would fail here and again server-side.
 */

const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'
const errorClass = 'mt-1 text-xs text-red-600'
const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

type CatalogForm = {
  jobTitle: string
  companyId: string
  jobLocation: string
  isRemote: boolean
  jobDescription: string
  datePosted: string
  applicationDeadline: string
  salaryText: string
  jobType: string
  experienceLevel: string
  securityClearanceReq: boolean
  isActive: boolean
}

function formFromJob(job: JobDetail): CatalogForm {
  return {
    jobTitle: job.jobTitle,
    companyId: job.companyId != null ? String(job.companyId) : '',
    jobLocation: job.jobLocation ?? '',
    isRemote: job.isRemote ?? false,
    jobDescription: job.jobDescription ?? '',
    datePosted: job.datePosted ?? '',
    applicationDeadline: job.applicationDeadline ?? '',
    salaryText: job.salaryText ?? '',
    jobType: job.jobType ?? '',
    experienceLevel: job.experienceLevel ?? '',
    securityClearanceReq: job.securityClearanceReq ?? false,
    isActive: job.isActive ?? true,
  }
}

/** Exported for tests: the catalog-only body this form submits. */
export function catalogPatchBody(form: CatalogForm): Record<string, unknown> {
  return {
    job_title: form.jobTitle.trim(),
    company_id: form.companyId ? Number(form.companyId) : null,
    job_location: form.jobLocation.trim(),
    is_remote: form.isRemote,
    job_description: form.jobDescription,
    date_posted: form.datePosted,
    application_deadline: form.applicationDeadline,
    salary_text: form.salaryText.trim(),
    job_type: form.jobType || null,
    experience_level: form.experienceLevel || null,
    security_clearance_req: form.securityClearanceReq,
    is_active: form.isActive,
  }
}

export default function AdminEditCatalogJobPage() {
  // Client page: read the dynamic segment with `useParams`, matching `/jobs/[id]`.
  const { id } = useParams<{ id: string }>()
  return (
    <AdminGuard>
      <CatalogEditor id={id} />
    </AdminGuard>
  )
}

function CatalogEditor({ id }: { id: string }) {
  const router = useRouter()
  const { data: job, isLoading } = useJob(id)
  const { data: companies = [] } = useCompanies()
  const patchCatalog = usePatchCatalogJob()
  const deleteJob = useDeleteJob()

  const [form, setForm] = React.useState<CatalogForm | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const initializedRef = React.useRef(false)

  React.useEffect(() => {
    if (!job || initializedRef.current) return
    initializedRef.current = true
    setForm(formFromJob(job))
  }, [job])

  function update<K extends keyof CatalogForm>(field: K, value: CatalogForm[K]) {
    setForm(current => (current ? { ...current, [field]: value } : current))
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form) return
    const parsed = jobCatalogPatchSchema.safeParse(catalogPatchBody(form))
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form')
        if (!next[key]) next[key] = issue.message
      }
      setFieldErrors(next)
      return
    }
    setFieldErrors({})
    patchCatalog.mutate(
      { id, body: parsed.data },
      { onSuccess: () => router.push(`/jobs/${id}`) },
    )
  }

  if (isLoading) {
    return (
      <div className="p-8 max-w-3xl" aria-busy="true">
        <Skeleton className="h-7 w-56 mb-2" />
        <Skeleton className="h-4 w-72 mb-6" />
        <Card>
          <CardContent className="pt-6 space-y-4">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="p-8 text-center">
        <p className="text-lg font-medium mb-2">Catalog posting not found</p>
        <Link href="/jobs" className="text-sm text-blue-600 underline">Back to jobs</Link>
      </div>
    )
  }

  const f = form ?? formFromJob(job)

  return (
    <div className="p-8 max-w-3xl">
      <PageHeader
        title={`Edit catalog posting: ${job.jobTitle}`}
        description="Shared catalog facts — these change what every user sees for this posting"
      />

      <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        You are editing the <strong>global catalog</strong>. Nothing here belongs to a single
        user. Your own stage, priority, and notes live on{' '}
        <Link href={`/jobs/${id}/edit`} className="underline">My application</Link>.
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-sm">Posting facts</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="company_id" className={labelClass}>Company</label>
                <select
                  id="company_id"
                  value={f.companyId}
                  onChange={e => update('companyId', e.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="">— None —</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {fieldErrors.company_id && <p className={errorClass}>{fieldErrors.company_id}</p>}
              </div>
              <div>
                <label htmlFor="job_title" className={labelClass}>Job title *</label>
                <Input id="job_title" value={f.jobTitle} onChange={e => update('jobTitle', e.target.value)} />
                {fieldErrors.job_title && <p className={errorClass}>{fieldErrors.job_title}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="job_location" className={labelClass}>Location</label>
                <Input id="job_location" value={f.jobLocation} onChange={e => update('jobLocation', e.target.value)} />
                {fieldErrors.job_location && <p className={errorClass}>{fieldErrors.job_location}</p>}
              </div>
              <div className="flex items-end pb-1 gap-2">
                <input
                  id="is_remote"
                  type="checkbox"
                  checked={f.isRemote}
                  onChange={e => update('isRemote', e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <label htmlFor="is_remote" className="text-sm font-medium text-slate-700">Remote</label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="job_type" className={labelClass}>Job type</label>
                <select id="job_type" value={f.jobType} onChange={e => update('jobType', e.target.value)} className={SELECT_CLASS}>
                  <option value="">— None —</option>
                  {JOB_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="experience_level" className={labelClass}>Experience level</label>
                <select id="experience_level" value={f.experienceLevel} onChange={e => update('experienceLevel', e.target.value)} className={SELECT_CLASS}>
                  <option value="">— None —</option>
                  {EXPERIENCE_LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="date_posted" className={labelClass}>Date posted</label>
                <Input id="date_posted" type="date" value={f.datePosted} onChange={e => update('datePosted', e.target.value)} />
                {fieldErrors.date_posted && <p className={errorClass}>{fieldErrors.date_posted}</p>}
              </div>
              <div>
                <label htmlFor="application_deadline" className={labelClass}>Application deadline</label>
                <Input id="application_deadline" type="date" value={f.applicationDeadline} onChange={e => update('applicationDeadline', e.target.value)} />
                {fieldErrors.application_deadline && <p className={errorClass}>{fieldErrors.application_deadline}</p>}
              </div>
            </div>

            <div>
              <label htmlFor="salary_text" className={labelClass}>Salary text</label>
              <Input id="salary_text" value={f.salaryText} onChange={e => update('salaryText', e.target.value)} placeholder="e.g. $120k–$160k/yr" />
              {fieldErrors.salary_text && <p className={errorClass}>{fieldErrors.salary_text}</p>}
            </div>

            <div>
              <label htmlFor="job_description" className={labelClass}>Job description</label>
              <Textarea
                id="job_description"
                value={f.jobDescription}
                onChange={e => update('jobDescription', e.target.value)}
                className="min-h-[180px]"
              />
              {fieldErrors.job_description && <p className={errorClass}>{fieldErrors.job_description}</p>}
            </div>

            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-2">
                <input
                  id="security_clearance_req"
                  type="checkbox"
                  checked={f.securityClearanceReq}
                  onChange={e => update('securityClearanceReq', e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <label htmlFor="security_clearance_req" className="text-sm font-medium text-slate-700">
                  Security clearance required
                </label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="is_active"
                  type="checkbox"
                  checked={f.isActive}
                  onChange={e => update('isActive', e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <label htmlFor="is_active" className="text-sm font-medium text-slate-700">
                  Active in the catalog
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        {patchCatalog.isError && (
          <p className="text-sm text-red-600">
            {patchCatalog.error instanceof Error ? patchCatalog.error.message : 'Failed to save catalog changes.'}
          </p>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={patchCatalog.isPending}>
            {patchCatalog.isPending ? 'Saving…' : 'Save catalog posting'}
          </Button>
          <Link
            href={`/jobs/${id}`}
            className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 h-9 text-sm font-medium text-slate-900 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </Link>
          <Button
            type="button"
            variant="ghost"
            className="ml-auto text-red-500 hover:text-red-700"
            disabled={deleteJob.isPending}
            onClick={() => setDeleteOpen(true)}
          >
            Remove from catalog
          </Button>
        </div>
      </form>

      <div className="mt-6 space-y-6 pb-8">
        <Card>
          <CardHeader><CardTitle className="text-sm">Structured salary (catalog)</CardTitle></CardHeader>
          <CardContent>
            <JobSalaryInlineEditor jobId={id} job={job} />
          </CardContent>
        </Card>
        <JobTaxonomyCard jobId={id} job={job} />
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove &quot;{job.jobTitle}&quot; from the catalog?</AlertDialogTitle>
            <AlertDialogDescription>
              This soft-deletes the shared posting for every user: it stops appearing in Browse
              Catalog and in each user&apos;s My Jobs list. Users&apos; own saved application state,
              private contacts, and activity history are not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteJob.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deleteJob.isPending}
              onClick={() => {
                deleteJob.mutate({ id }, { onSuccess: () => router.push('/jobs') })
                setDeleteOpen(false)
              }}
            >
              Remove from catalog
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
