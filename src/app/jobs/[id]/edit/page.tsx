'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/layout/PageHeader'
import { useJob, usePatchJob } from '@/lib/queries'
import { jobPatchSchema } from '@/lib/schemas'

type JobPatchFormValues = z.infer<typeof jobPatchSchema>

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

const STAGE_OPTIONS = [
  { value: 'not_applied', label: 'Not Applied' },
  { value: 'applied', label: 'Applied' },
  { value: 'phone_screen', label: 'Phone Screen' },
  { value: 'technical_screen', label: 'Technical Screen' },
  { value: 'onsite', label: 'Onsite' },
  { value: 'offer_received', label: 'Offer Received' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
]

const JOB_TYPES = [
  { value: 'full_time', label: 'Full Time' },
  { value: 'part_time', label: 'Part Time' },
  { value: 'contract', label: 'Contract' },
  { value: 'internship', label: 'Internship' },
  { value: 'temp', label: 'Temp' },
  { value: 'freelance', label: 'Freelance' },
]

const EXPERIENCE_LEVELS = [
  { value: 'entry', label: 'Entry' },
  { value: 'mid', label: 'Mid' },
  { value: 'senior', label: 'Senior' },
  { value: 'lead', label: 'Lead' },
  { value: 'executive', label: 'Executive' },
]

const SOURCE_PLATFORMS = [
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'indeed', label: 'Indeed' },
  { value: 'glassdoor', label: 'Glassdoor' },
  { value: 'dice', label: 'Dice' },
  { value: 'lever', label: 'Lever' },
  { value: 'greenhouse', label: 'Greenhouse' },
  { value: 'workday', label: 'Workday' },
  { value: 'angellist', label: 'AngelList' },
  { value: 'direct', label: 'Direct' },
  { value: 'other', label: 'Other' },
]

const SALARY_TYPES = [
  { value: 'annual', label: 'Annual' },
  { value: 'hourly', label: 'Hourly' },
]

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
  const patchJob = usePatchJob()

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<JobPatchFormValues>({
    resolver: zodResolver(jobPatchSchema),
  })

  // Pre-populate once data arrives
  React.useEffect(() => {
    if (!job) return
    reset({
      job_title: job.jobTitle ?? undefined,
      job_location: job.jobLocation ?? undefined,
      is_remote: job.isRemote ?? undefined,
      job_type: (job.jobType as JobPatchFormValues['job_type']) ?? undefined,
      experience_level: (job.experienceLevel as JobPatchFormValues['experience_level']) ?? undefined,
      priority: job.priority ?? undefined,
      salary_type: (job.salaryType as JobPatchFormValues['salary_type']) ?? undefined,
      salary_min: job.salaryMin ?? undefined,
      salary_max: job.salaryMax ?? undefined,
      hourly_rate_min: job.hourlyRateMin != null ? Number(job.hourlyRateMin) : undefined,
      hourly_rate_max: job.hourlyRateMax != null ? Number(job.hourlyRateMax) : undefined,
      salary_text: job.salaryText ?? undefined,
      date_posted: job.datePosted ?? undefined,
      application_deadline: job.applicationDeadline ?? undefined,
      job_description: job.jobDescription ?? undefined,
      interview_stage: (job.interviewStage as JobPatchFormValues['interview_stage']) ?? undefined,
      has_applied: job.hasApplied ?? undefined,
      date_applied: job.dateApplied ?? undefined,
      heard_back: job.heardBack ?? undefined,
      referral: job.referral ?? undefined,
      cover_letter_submitted: job.coverLetterSubmitted ?? undefined,
      resume_version: job.resumeVersion ?? undefined,
      rejection_reason: job.rejectionReason ?? undefined,
      security_clearance_req: job.securityClearanceReq ?? undefined,
      notes: job.notes ?? undefined,
    })
  }, [job, reset])

  async function onSubmit(values: JobPatchFormValues) {
    // Strip undefined values while preserving intentional empty-string clears.
    const body = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v !== undefined)
    ) as Record<string, unknown>

    try {
      await patchJob.mutateAsync({ id, body })
      router.push(`/jobs/${id}`)
    } catch {
      // Error surfaced via patchJob.isError / patchJob.error below
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

  const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'
  const errorClass = 'mt-1 text-xs text-red-600'

  // TODO: Tag editing (skills, software, keywords, certifications) is not yet
  // implemented here. Tags are managed via junction tables and require separate
  // API mutations. For v1, view existing tags on /jobs/[id] and edit them there
  // once tag-mutation endpoints are available.

  return (
    <div className="p-8 max-w-3xl">
      <PageHeader
        title={`Edit: ${job.jobTitle}`}
        description={job.companyName ?? 'Edit all fields for this job listing'}
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

        {/* ── Basic Info ─────────────────────────────────────────── */}
        <Card>
          <CardContent className="pt-6 space-y-5">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Basic Info</h2>

            <div>
              <label htmlFor="job_title" className={labelClass}>Job Title *</label>
              <Input id="job_title" {...register('job_title')} placeholder="e.g. Senior Software Engineer" />
              {errors.job_title && <p className={errorClass}>{errors.job_title.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="job_location" className={labelClass}>Location</label>
                <Input id="job_location" {...register('job_location')} placeholder="e.g. Austin, TX" />
                {errors.job_location && <p className={errorClass}>{errors.job_location.message}</p>}
              </div>
              <div className="flex items-end gap-2 pb-1">
                <input
                  id="is_remote"
                  type="checkbox"
                  {...register('is_remote')}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <label htmlFor="is_remote" className="text-sm font-medium text-slate-700">Remote</label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="job_type" className={labelClass}>Job Type</label>
                <select id="job_type" {...register('job_type')} className={SELECT_CLASS}>
                  <option value="">— Select —</option>
                  {JOB_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                {errors.job_type && <p className={errorClass}>{errors.job_type.message}</p>}
              </div>
              <div>
                <label htmlFor="experience_level" className={labelClass}>Experience Level</label>
                <select id="experience_level" {...register('experience_level')} className={SELECT_CLASS}>
                  <option value="">— Select —</option>
                  {EXPERIENCE_LEVELS.map(l => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
                {errors.experience_level && <p className={errorClass}>{errors.experience_level.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="source_platform" className={labelClass}>Source Platform</label>
                <select
                  id="source_platform"
                  className={SELECT_CLASS}
                  disabled
                  title="Platform cannot be changed after creation"
                >
                  <option value={job.sourcePlatform ?? ''}>
                    {SOURCE_PLATFORMS.find(p => p.value === job.sourcePlatform)?.label ?? job.sourcePlatform ?? '—'}
                  </option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Priority</label>
                <div className="flex gap-3 items-center h-9">
                  {[1, 2, 3, 4, 5].map(n => (
                    <label key={n} className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        value={n}
                        {...register('priority', { valueAsNumber: true })}
                        className="h-4 w-4"
                      />
                      {n}
                    </label>
                  ))}
                </div>
                {errors.priority && <p className={errorClass}>{errors.priority.message}</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Salary ─────────────────────────────────────────────── */}
        <Card>
          <CardContent className="pt-6 space-y-5">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Salary</h2>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor="salary_type" className={labelClass}>Salary Type</label>
                <select id="salary_type" {...register('salary_type')} className={SELECT_CLASS}>
                  <option value="">— Select —</option>
                  {SALARY_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label htmlFor="salary_text" className={labelClass}>Salary Text (display)</label>
                <Input id="salary_text" {...register('salary_text')} placeholder="e.g. $120k–$160k/yr" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="salary_min" className={labelClass}>Annual Min (cents)</label>
                <Input
                  id="salary_min"
                  type="number"
                  {...register('salary_min', { valueAsNumber: true })}
                  placeholder="e.g. 12000000"
                />
                {errors.salary_min && <p className={errorClass}>{errors.salary_min.message}</p>}
              </div>
              <div>
                <label htmlFor="salary_max" className={labelClass}>Annual Max (cents)</label>
                <Input
                  id="salary_max"
                  type="number"
                  {...register('salary_max', { valueAsNumber: true })}
                  placeholder="e.g. 16000000"
                />
                {errors.salary_max && <p className={errorClass}>{errors.salary_max.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="hourly_rate_min" className={labelClass}>Hourly Min ($/hr)</label>
                <Input
                  id="hourly_rate_min"
                  type="number"
                  step="0.01"
                  {...register('hourly_rate_min', { valueAsNumber: true })}
                  placeholder="e.g. 55.00"
                />
                {errors.hourly_rate_min && <p className={errorClass}>{errors.hourly_rate_min.message}</p>}
              </div>
              <div>
                <label htmlFor="hourly_rate_max" className={labelClass}>Hourly Max ($/hr)</label>
                <Input
                  id="hourly_rate_max"
                  type="number"
                  step="0.01"
                  {...register('hourly_rate_max', { valueAsNumber: true })}
                  placeholder="e.g. 80.00"
                />
                {errors.hourly_rate_max && <p className={errorClass}>{errors.hourly_rate_max.message}</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Dates ──────────────────────────────────────────────── */}
        <Card>
          <CardContent className="pt-6 space-y-5">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Dates</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="date_posted" className={labelClass}>Date Posted</label>
                <Input id="date_posted" type="date" {...register('date_posted')} />
                {errors.date_posted && <p className={errorClass}>{errors.date_posted.message}</p>}
              </div>
              <div>
                <label htmlFor="application_deadline" className={labelClass}>Application Deadline</label>
                <Input id="application_deadline" type="date" {...register('application_deadline')} />
                {errors.application_deadline && <p className={errorClass}>{errors.application_deadline.message}</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Description ────────────────────────────────────────── */}
        <Card>
          <CardContent className="pt-6 space-y-5">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Description</h2>
            <div>
              <label htmlFor="job_description" className={labelClass}>Job Description</label>
              <Textarea
                id="job_description"
                {...register('job_description')}
                placeholder="Paste the full job description here…"
                className="min-h-[200px] font-mono text-xs"
              />
              {errors.job_description && <p className={errorClass}>{errors.job_description.message}</p>}
            </div>
          </CardContent>
        </Card>

        {/* ── Status ─────────────────────────────────────────────── */}
        <Card>
          <CardContent className="pt-6 space-y-5">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Status</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="interview_stage" className={labelClass}>Interview Stage</label>
                <select id="interview_stage" {...register('interview_stage')} className={SELECT_CLASS}>
                  <option value="">— Select —</option>
                  {STAGE_OPTIONS.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                {errors.interview_stage && <p className={errorClass}>{errors.interview_stage.message}</p>}
              </div>
              <div>
                <label htmlFor="date_applied" className={labelClass}>Date Applied</label>
                <Input id="date_applied" type="date" {...register('date_applied')} />
                {errors.date_applied && <p className={errorClass}>{errors.date_applied.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <input
                  id="has_applied"
                  type="checkbox"
                  {...register('has_applied')}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <label htmlFor="has_applied" className="text-sm font-medium text-slate-700">Has Applied</label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="heard_back"
                  type="checkbox"
                  {...register('heard_back')}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <label htmlFor="heard_back" className="text-sm font-medium text-slate-700">Heard Back</label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <input
                  id="referral"
                  type="checkbox"
                  {...register('referral')}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <label htmlFor="referral" className="text-sm font-medium text-slate-700">Referral</label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="cover_letter_submitted"
                  type="checkbox"
                  {...register('cover_letter_submitted')}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <label htmlFor="cover_letter_submitted" className="text-sm font-medium text-slate-700">Cover Letter Submitted</label>
              </div>
            </div>

            <div>
              <label htmlFor="resume_version" className={labelClass}>Resume Version</label>
              <Input id="resume_version" {...register('resume_version')} placeholder="e.g. v3-swe-2024" />
              {errors.resume_version && <p className={errorClass}>{errors.resume_version.message}</p>}
            </div>

            <div>
              <label htmlFor="rejection_reason" className={labelClass}>Rejection Reason</label>
              <Input id="rejection_reason" {...register('rejection_reason')} placeholder="e.g. Overqualified" />
              {errors.rejection_reason && <p className={errorClass}>{errors.rejection_reason.message}</p>}
            </div>
          </CardContent>
        </Card>

        {/* ── Other ──────────────────────────────────────────────── */}
        <Card>
          <CardContent className="pt-6 space-y-5">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Other</h2>

            <div className="flex items-center gap-2">
              <input
                id="security_clearance_req"
                type="checkbox"
                {...register('security_clearance_req')}
                className="h-4 w-4 rounded border-slate-300"
              />
              <label htmlFor="security_clearance_req" className="text-sm font-medium text-slate-700">
                Security Clearance Required
              </label>
            </div>

            <div>
              <label htmlFor="notes" className={labelClass}>Notes</label>
              <Textarea
                id="notes"
                {...register('notes')}
                placeholder="Any notes about this job…"
                className="min-h-[100px]"
              />
              {errors.notes && <p className={errorClass}>{errors.notes.message}</p>}
            </div>
          </CardContent>
        </Card>

        {/* ── Tags notice ────────────────────────────────────────── */}
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Tags</h2>
            <p className="text-sm text-slate-500">
              Current tags: skills ({job.skills.map(s => s.name).join(', ') || 'none'}),
              software ({job.software.map(s => s.name).join(', ') || 'none'}),
              keywords ({job.keywords.map(k => k.name).join(', ') || 'none'}),
              certifications ({job.certifications.map(c => c.name).join(', ') || 'none'}).
            </p>
            <p className="text-xs text-slate-600 mt-1">
              {/* TODO: Tag editing requires separate junction-table mutations — planned for a future ticket */}
              Tag editing is not available in this form yet. Tags can be managed via the scraper webhook.
            </p>
          </CardContent>
        </Card>

        {patchJob.isError && (
          <p className="text-sm text-red-600">
            {patchJob.error instanceof Error ? patchJob.error.message : 'Failed to save changes.'}
          </p>
        )}

        <div className="flex gap-3 pb-8">
          <Button type="submit" disabled={patchJob.isPending}>
            {patchJob.isPending ? 'Saving…' : 'Save Changes'}
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
