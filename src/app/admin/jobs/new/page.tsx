'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/PageHeader'
import { AdminGuard } from '@/components/admin/AdminGuard'
import { useCompanies, useCreateCatalogJob } from '@/lib/queries'
import { jobCatalogCreateSchema } from '@/lib/schemas'
import { jobTypeOptions as JOB_TYPES, experienceLevelOptions as EXPERIENCE_LEVELS } from '@/lib/enums'

/**
 * PAGE-017 — `Create catalog job`, the admin-only replacement for the old manual
 * `New Job` form.
 *
 * Ordinary users no longer create postings: publishing a private listing to the shared
 * catalog is exactly the leak PAGE-017 forbids, so `/jobs/new` is now catalog
 * search/select → `Save to My Jobs`. Admins publish here, using the same
 * `jobCatalogCreateSchema` the `POST /api/admin/jobs` handler validates with — that
 * schema deliberately has no personal-state fields.
 */

const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'
const errorClass = 'mt-1 text-xs text-red-600'
const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

type CreateForm = {
  jobTitle: string
  jobLink: string
  companyId: string
  jobLocation: string
  isRemote: boolean
  jobType: string
  experienceLevel: string
  salaryText: string
}

const emptyForm: CreateForm = {
  jobTitle: '', jobLink: '', companyId: '', jobLocation: '',
  isRemote: false, jobType: '', experienceLevel: '', salaryText: '',
}

/** Exported for tests: the catalog-only create body, with empty optionals dropped. */
export function catalogCreateBody(form: CreateForm): Record<string, unknown> {
  const body: Record<string, unknown> = {
    job_title: form.jobTitle.trim(),
    is_remote: form.isRemote,
  }
  if (form.jobLink.trim()) body.job_link = form.jobLink.trim()
  if (form.companyId) body.company_id = Number(form.companyId)
  if (form.jobLocation.trim()) body.job_location = form.jobLocation.trim()
  if (form.jobType) body.job_type = form.jobType
  if (form.experienceLevel) body.experience_level = form.experienceLevel
  if (form.salaryText.trim()) body.salary_text = form.salaryText.trim()
  return body
}

export default function AdminNewCatalogJobPage() {
  return (
    <AdminGuard>
      <CatalogCreateForm />
    </AdminGuard>
  )
}

function CatalogCreateForm() {
  const router = useRouter()
  const { data: companies = [] } = useCompanies()
  const createCatalogJob = useCreateCatalogJob()
  const [form, setForm] = React.useState<CreateForm>(emptyForm)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})

  function update<K extends keyof CreateForm>(field: K, value: CreateForm[K]) {
    setForm(current => ({ ...current, [field]: value }))
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = jobCatalogCreateSchema.safeParse(catalogCreateBody(form))
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
    createCatalogJob.mutate(parsed.data, {
      onSuccess: (data) => router.push(`/admin/jobs/${data.job_id}/edit`),
    })
  }

  return (
    <div className="p-8 max-w-3xl">
      <PageHeader
        title="Create catalog job"
        description="Publishes a posting to the shared catalog that every user can browse"
      />
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="company_id" className={labelClass}>Company</label>
                <select id="company_id" value={form.companyId} onChange={e => update('companyId', e.target.value)} className={SELECT_CLASS}>
                  <option value="">— Select company —</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {fieldErrors.company_id && <p className={errorClass}>{fieldErrors.company_id}</p>}
              </div>
              <div>
                <label htmlFor="job_title" className={labelClass}>Job title *</label>
                <Input id="job_title" value={form.jobTitle} onChange={e => update('jobTitle', e.target.value)} placeholder="e.g. Senior Software Engineer" />
                {fieldErrors.job_title && <p className={errorClass}>{fieldErrors.job_title}</p>}
              </div>
            </div>

            <div>
              <label htmlFor="job_link" className={labelClass}>Job link</label>
              <Input id="job_link" type="url" value={form.jobLink} onChange={e => update('jobLink', e.target.value)} placeholder="https://…" />
              {fieldErrors.job_link && <p className={errorClass}>{fieldErrors.job_link}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="job_location" className={labelClass}>Location</label>
                <Input id="job_location" value={form.jobLocation} onChange={e => update('jobLocation', e.target.value)} placeholder="e.g. Austin, TX" />
                {fieldErrors.job_location && <p className={errorClass}>{fieldErrors.job_location}</p>}
              </div>
              <div className="flex items-end pb-1 gap-2">
                <input
                  id="is_remote"
                  type="checkbox"
                  checked={form.isRemote}
                  onChange={e => update('isRemote', e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <label htmlFor="is_remote" className="text-sm font-medium text-slate-700">Remote</label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="job_type" className={labelClass}>Job type</label>
                <select id="job_type" value={form.jobType} onChange={e => update('jobType', e.target.value)} className={SELECT_CLASS}>
                  <option value="">— Select —</option>
                  {JOB_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="experience_level" className={labelClass}>Experience level</label>
                <select id="experience_level" value={form.experienceLevel} onChange={e => update('experienceLevel', e.target.value)} className={SELECT_CLASS}>
                  <option value="">— Select —</option>
                  {EXPERIENCE_LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="salary_text" className={labelClass}>Salary text</label>
              <Input id="salary_text" value={form.salaryText} onChange={e => update('salaryText', e.target.value)} placeholder="e.g. $120k–$160k/yr" />
              {fieldErrors.salary_text && <p className={errorClass}>{fieldErrors.salary_text}</p>}
            </div>

            {createCatalogJob.isError && (
              <p className="text-sm text-red-600">
                {createCatalogJob.error instanceof Error ? createCatalogJob.error.message : 'Failed to create catalog job.'}
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={createCatalogJob.isPending}>
                {createCatalogJob.isPending ? 'Publishing…' : 'Publish to catalog'}
              </Button>
              <Link
                href="/jobs/new"
                className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 h-9 text-sm font-medium text-slate-900 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
