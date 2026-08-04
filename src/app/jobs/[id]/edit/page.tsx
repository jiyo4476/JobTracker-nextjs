'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  useJob,
  usePatchJobState,
  useResumeVersions,
  type JobDetail,
} from '@/lib/queries'
import { interviewStageOptions as STAGE_OPTIONS, type InterviewStage } from '@/lib/enums'

// PAGE-017: this page is now the PERSONAL application editor. It writes ONLY to the
// owner-scoped /api/jobs/[id]/state route — never the old global PATCH /api/jobs/[id].
// Catalog facts (title, company, salary, description, tags) are read-only here and are
// edited through the (admin-only, deferred) catalog editor.

type AppForm = {
  interviewStage: InterviewStage
  priority: string
  hasApplied: boolean
  dateApplied: string
  heardBack: boolean
  referral: boolean
  coverLetterSubmitted: boolean
  resumeVersionId: string
  rejectionReason: string
  notes: string
}

function formFromJob(job: JobDetail): AppForm {
  const s = job.userState
  return {
    interviewStage: (s?.interviewStage ?? 'not_applied') as InterviewStage,
    priority: s?.priority != null ? String(s.priority) : '',
    hasApplied: s?.hasApplied ?? false,
    dateApplied: s?.dateApplied ?? '',
    heardBack: s?.heardBack ?? false,
    referral: s?.referral ?? false,
    coverLetterSubmitted: s?.coverLetterSubmitted ?? false,
    resumeVersionId: s?.resumeVersionId != null ? String(s.resumeVersionId) : '',
    rejectionReason: s?.rejectionReason ?? '',
    notes: s?.notes ?? '',
  }
}

const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'
const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

function SkeletonForm() {
  return (
    <div className="p-8 max-w-3xl">
      <Skeleton className="h-7 w-48 mb-2" />
      <Skeleton className="h-4 w-64 mb-6" />
      <Card>
        <CardContent className="pt-6 space-y-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

export default function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params)
  const router = useRouter()
  const { data: job, isLoading } = useJob(id)
  const { data: resumeVersions = [] } = useResumeVersions()
  const patchState = usePatchJobState()

  const [form, setForm] = React.useState<AppForm | null>(null)
  const initializedRef = React.useRef(false)
  React.useEffect(() => {
    if (!job || initializedRef.current) return
    initializedRef.current = true
    setForm(formFromJob(job))
  }, [job])

  function update<K extends keyof AppForm>(field: K, value: AppForm[K]) {
    setForm(current => (current ? { ...current, [field]: value } : current))
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!form) return
    try {
      await patchState.mutateAsync({
        id,
        body: {
          interview_stage: form.interviewStage,
          priority: form.priority ? Number(form.priority) : null,
          has_applied: form.hasApplied,
          date_applied: form.dateApplied,
          heard_back: form.heardBack,
          referral: form.referral,
          cover_letter_submitted: form.coverLetterSubmitted,
          resume_version_id: form.resumeVersionId ? Number(form.resumeVersionId) : null,
          rejection_reason: form.rejectionReason.trim() || null,
          notes: form.notes.trim() || null,
        },
      })
      router.push(`/jobs/${id}`)
    } catch {
      // surfaced via patchState.isError below
    }
  }

  if (isLoading) return <SkeletonForm />

  if (!job) {
    return (
      <div className="p-8 text-center">
        <p className="text-lg font-medium mb-2">Job not found</p>
        <Link href="/jobs" className="text-sm text-blue-600 underline">Back to jobs</Link>
      </div>
    )
  }

  const f = form ?? formFromJob(job)

  return (
    <div className="p-8 max-w-3xl">
      <PageHeader
        title={`My application: ${job.jobTitle}`}
        description={job.companyName ?? 'Edit your personal application details for this job'}
      />

      {!job.isTracked && (
        <div className="mb-6 rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          You are not tracking this job yet. Saving below adds it to My Jobs.
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-6">
        <Card>
          <CardContent className="pt-6 space-y-5">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">My application</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="interview_stage" className={labelClass}>Interview stage</label>
                <select id="interview_stage" value={f.interviewStage} onChange={e => update('interviewStage', e.target.value as InterviewStage)} className={SELECT_CLASS}>
                  {STAGE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="priority" className={labelClass}>Priority</label>
                <select id="priority" value={f.priority} onChange={e => update('priority', e.target.value)} className={SELECT_CLASS}>
                  <option value="">None</option>
                  {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{'★'.repeat(n)}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <input id="has_applied" type="checkbox" checked={f.hasApplied} onChange={e => update('hasApplied', e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                <label htmlFor="has_applied" className="text-sm font-medium text-slate-700">Has applied</label>
              </div>
              <div>
                <label htmlFor="date_applied" className={labelClass}>Date applied</label>
                <Input id="date_applied" type="date" value={f.dateApplied} onChange={e => update('dateApplied', e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <input id="heard_back" type="checkbox" checked={f.heardBack} onChange={e => update('heardBack', e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                <label htmlFor="heard_back" className="text-sm font-medium text-slate-700">Heard back</label>
              </div>
              <div className="flex items-center gap-2">
                <input id="referral" type="checkbox" checked={f.referral} onChange={e => update('referral', e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                <label htmlFor="referral" className="text-sm font-medium text-slate-700">Referral</label>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input id="cover_letter_submitted" type="checkbox" checked={f.coverLetterSubmitted} onChange={e => update('coverLetterSubmitted', e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              <label htmlFor="cover_letter_submitted" className="text-sm font-medium text-slate-700">Cover letter submitted</label>
            </div>

            <div>
              <label htmlFor="resume_version_id" className={labelClass}>Resume version</label>
              <select id="resume_version_id" value={f.resumeVersionId} onChange={e => update('resumeVersionId', e.target.value)} className={SELECT_CLASS}>
                <option value="">None</option>
                {resumeVersions.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>

            <div>
              <label htmlFor="rejection_reason" className={labelClass}>Rejection reason</label>
              <Input id="rejection_reason" value={f.rejectionReason} onChange={e => update('rejectionReason', e.target.value)} placeholder="e.g. Overqualified" />
            </div>

            <div>
              <label htmlFor="notes" className={labelClass}>Private notes</label>
              <Textarea id="notes" value={f.notes} onChange={e => update('notes', e.target.value)} placeholder="Notes only you can see…" className="min-h-[120px]" />
            </div>
          </CardContent>
        </Card>

        {patchState.isError && (
          <p className="text-sm text-red-600">
            {patchState.error instanceof Error ? patchState.error.message : 'Failed to save changes.'}
          </p>
        )}

        <div className="flex gap-3 pb-8">
          <Button type="submit" disabled={patchState.isPending}>
            {patchState.isPending ? 'Saving…' : 'Save application'}
          </Button>
          <Link
            href={`/jobs/${id}`}
            className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 h-9 text-sm font-medium text-slate-900 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
