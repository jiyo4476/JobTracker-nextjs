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
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/layout/PageHeader'
import { X } from 'lucide-react'
import {
  useJob,
  usePatchJob,
  usePatchJobSalary,
  usePatchJobTags,
  useTagLookup,
  type JobDetail,
  type LookupItem,
  type TagLookupType,
} from '@/lib/queries'
import { jobPatchSchema } from '@/lib/schemas'
import { getSourcePlatformLabel } from '@/lib/source-platforms'

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

const SALARY_TYPES = [
  { value: 'annual', label: 'Annual' },
  { value: 'hourly', label: 'Hourly' },
]

const CURRENCY_OPTIONS = ['USD', 'EUR', 'GBP', 'CAD', 'AUD']

type SalaryFormState = {
  salaryType: 'annual' | 'hourly' | ''
  salaryMin: string
  salaryMax: string
  hourlyRateMin: string
  hourlyRateMax: string
  salaryCurrency: string
  salaryText: string
}

function salaryStateFromJob(job: JobDetail): SalaryFormState {
  return {
    salaryType: (job.salaryType as SalaryFormState['salaryType']) ?? '',
    salaryMin: job.salaryMin != null ? String(Math.round(job.salaryMin / 100)) : '',
    salaryMax: job.salaryMax != null ? String(Math.round(job.salaryMax / 100)) : '',
    hourlyRateMin: job.hourlyRateMin != null ? String(Number(job.hourlyRateMin)) : '',
    hourlyRateMax: job.hourlyRateMax != null ? String(Number(job.hourlyRateMax)) : '',
    salaryCurrency: job.salaryCurrency ?? 'USD',
    salaryText: job.salaryText ?? '',
  }
}

function parseOptionalNumber(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed.replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : NaN
}

function hasMoreThanTwoDecimalPlaces(value: number | null) {
  return value !== null && !Number.isNaN(value) && Number(value.toFixed(2)) !== value
}

function formatCurrencyRange(form: SalaryFormState) {
  const currency = form.salaryCurrency || 'USD'
  const currencyIsValid = /^[A-Z]{3}$/.test(currency)
  if (!currencyIsValid) return 'Invalid currency code'
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: form.salaryType === 'hourly' ? 2 : 0,
  })
  const min = form.salaryType === 'hourly'
    ? parseOptionalNumber(form.hourlyRateMin)
    : parseOptionalNumber(form.salaryMin)
  const max = form.salaryType === 'hourly'
    ? parseOptionalNumber(form.hourlyRateMax)
    : parseOptionalNumber(form.salaryMax)
  if (min === null && max === null) return 'No salary information'
  if (Number.isNaN(min) || Number.isNaN(max)) return 'Invalid salary values'
  if (min !== null && max !== null) return `${formatter.format(min)} - ${formatter.format(max)}${form.salaryType === 'hourly' ? '/hr' : ''}`
  return 'Incomplete salary range'
}

function preventParentFormSubmit(event: React.KeyboardEvent) {
  if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
    event.preventDefault()
  }
}

function JobSalaryEditor({ jobId, job }: { jobId: string; job: JobDetail }) {
  const patchSalary = usePatchJobSalary()
  const [form, setForm] = React.useState(() => salaryStateFromJob(job))

  const annualMin = parseOptionalNumber(form.salaryMin)
  const annualMax = parseOptionalNumber(form.salaryMax)
  const hourlyMin = parseOptionalNumber(form.hourlyRateMin)
  const hourlyMax = parseOptionalNumber(form.hourlyRateMax)
  const activeMin = form.salaryType === 'hourly' ? hourlyMin : annualMin
  const activeMax = form.salaryType === 'hourly' ? hourlyMax : annualMax
  const salaryRangeProvided = activeMin !== null || activeMax !== null
  const salaryRangeComplete = activeMin !== null && activeMax !== null
  const numberInvalid = Number.isNaN(activeMin) || Number.isNaN(activeMax)
  const hourlyPrecisionInvalid = form.salaryType === 'hourly' && (
    hasMoreThanTwoDecimalPlaces(hourlyMin) || hasMoreThanTwoDecimalPlaces(hourlyMax)
  )
  const rangeInvalid = activeMin != null && activeMax != null && activeMin > activeMax
  const currencyInvalid = !/^[A-Z]{3}$/.test(form.salaryCurrency)
  const validationMessage = numberInvalid
    ? 'Salary values must be numbers.'
    : hourlyPrecisionInvalid
      ? 'Hourly values must have at most 2 decimal places.'
    : salaryRangeProvided && !salaryRangeComplete
      ? 'Provide both min and max, or clear both.'
      : rangeInvalid
        ? 'Min must be less than or equal to max.'
        : currencyInvalid
          ? 'Currency must be a 3-letter ISO code.'
          : ''
  const current = salaryStateFromJob(job)
  const isDirty = JSON.stringify(form) !== JSON.stringify(current)
  const canSave = isDirty && !validationMessage && !patchSalary.isPending

  function updateField(field: keyof SalaryFormState, value: string) {
    setForm(currentForm => ({ ...currentForm, [field]: field === 'salaryCurrency' ? value.toUpperCase() : value }))
  }

  function handleSave() {
    if (!canSave) return
    const structuredType = form.salaryType || (annualMin !== null || annualMax !== null ? 'annual' : null)
    const body: Record<string, unknown> = {
      salary_type: structuredType,
      salary_currency: form.salaryCurrency || null,
      salary_text: form.salaryText.trim() || null,
    }
    if (form.salaryType === 'hourly') {
      body.salary_min = null
      body.salary_max = null
      body.hourly_rate_min = hourlyMin
      body.hourly_rate_max = hourlyMax
    } else {
      body.salary_min = annualMin
      body.salary_max = annualMax
      body.hourly_rate_min = null
      body.hourly_rate_max = null
    }
    patchSalary.mutate({ id: jobId, body })
  }

  return (
    <Card onKeyDown={preventParentFormSubmit}>
      <CardContent className="pt-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Salary</h2>
          <span className="text-xs text-slate-500">{formatCurrencyRange(form)}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="salary_type_editor" className="block text-sm font-medium text-slate-700 mb-1.5">Salary Type</label>
            <select
              id="salary_type_editor"
              value={form.salaryType}
              onChange={e => updateField('salaryType', e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="">No structured salary</option>
              {SALARY_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="salary_currency_editor" className="block text-sm font-medium text-slate-700 mb-1.5">Currency</label>
            <Input
              id="salary_currency_editor"
              value={form.salaryCurrency}
              onChange={e => updateField('salaryCurrency', e.target.value)}
              list="salary-currency-options"
              maxLength={3}
            />
            <datalist id="salary-currency-options">
              {CURRENCY_OPTIONS.map(currency => <option key={currency} value={currency} />)}
            </datalist>
          </div>
          <div>
            <label htmlFor="salary_text_editor" className="block text-sm font-medium text-slate-700 mb-1.5">Display Text</label>
            <Input
              id="salary_text_editor"
              value={form.salaryText}
              onChange={e => updateField('salaryText', e.target.value)}
              placeholder="$120k - $160k/yr"
            />
          </div>
        </div>

        {form.salaryType === 'hourly' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="hourly_min_editor" className="block text-sm font-medium text-slate-700 mb-1.5">Hourly Min</label>
              <Input id="hourly_min_editor" inputMode="decimal" value={form.hourlyRateMin} onChange={e => updateField('hourlyRateMin', e.target.value)} placeholder="55.00" />
            </div>
            <div>
              <label htmlFor="hourly_max_editor" className="block text-sm font-medium text-slate-700 mb-1.5">Hourly Max</label>
              <Input id="hourly_max_editor" inputMode="decimal" value={form.hourlyRateMax} onChange={e => updateField('hourlyRateMax', e.target.value)} placeholder="80.00" />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="salary_min_editor" className="block text-sm font-medium text-slate-700 mb-1.5">Annual Min</label>
              <Input id="salary_min_editor" inputMode="numeric" value={form.salaryMin} onChange={e => updateField('salaryMin', e.target.value)} placeholder="80000" />
            </div>
            <div>
              <label htmlFor="salary_max_editor" className="block text-sm font-medium text-slate-700 mb-1.5">Annual Max</label>
              <Input id="salary_max_editor" inputMode="numeric" value={form.salaryMax} onChange={e => updateField('salaryMax', e.target.value)} placeholder="120000" />
            </div>
          </div>
        )}

        {validationMessage && <p className="text-xs text-red-600">{validationMessage}</p>}

        <div className="flex gap-2">
          <Button type="button" onClick={handleSave} disabled={!canSave}>
            {patchSalary.isPending ? 'Saving...' : 'Save Salary'}
          </Button>
          <Button type="button" variant="outline" onClick={() => setForm(current)} disabled={!isDirty || patchSalary.isPending}>
            Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function sameTagSet(a: LookupItem[], b: LookupItem[]) {
  const left = a.map(item => item.name).sort().join('\n')
  const right = b.map(item => item.name).sort().join('\n')
  return left === right
}

function TagColumn({
  title,
  type,
  value,
  onChange,
}: {
  title: string
  type: TagLookupType
  value: LookupItem[]
  onChange: (items: LookupItem[]) => void
}) {
  const [query, setQuery] = React.useState('')
  const { data: options = [] } = useTagLookup(type, query)
  const selectedNames = React.useMemo(() => new Set(value.map(item => item.name)), [value])

  function addTag(item: LookupItem) {
    if (selectedNames.has(item.name)) return
    onChange([...value, item].sort((a, b) => a.name.localeCompare(b.name)))
    setQuery('')
  }

  function removeTag(name: string) {
    onChange(value.filter(item => item.name !== name))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-slate-700">{title}</h3>
        <span className="text-xs text-slate-500">{value.length}</span>
      </div>
      <div className="min-h-8 flex flex-wrap gap-1.5">
        {value.length === 0 ? (
          <span className="text-xs text-slate-500">None</span>
        ) : value.map(item => (
          <Badge key={item.id} variant={type === 'skills' ? 'default' : type === 'certifications' ? 'warning' : 'secondary'} className="gap-1 pr-1">
            {item.name}
            <button
              type="button"
              onClick={() => removeTag(item.name)}
              className="rounded-full p-0.5 hover:bg-black/10"
              aria-label={`Remove ${item.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <Input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={`Add ${title.toLowerCase()}`}
      />
      {query.trim() && (
        <div className="max-h-36 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-sm">
          {options.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-500">No matches</p>
          ) : options.map(option => {
            const selected = selectedNames.has(option.name)
            return (
              <button
                key={option.id}
                type="button"
                disabled={selected}
                onClick={() => addTag(option)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:text-slate-400 disabled:hover:bg-white"
              >
                <span>{option.name}</span>
                {selected && <span className="text-xs">Selected</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function JobTagsEditor({ jobId, job }: { jobId: string; job: JobDetail }) {
  const patchTags = usePatchJobTags()
  const [skills, setSkills] = React.useState(job.skills)
  const [software, setSoftware] = React.useState(job.software)
  const [keywords, setKeywords] = React.useState(job.keywords)
  const [certifications, setCertifications] = React.useState(job.certifications)

  const isDirty = !sameTagSet(skills, job.skills) ||
    !sameTagSet(software, job.software) ||
    !sameTagSet(keywords, job.keywords) ||
    !sameTagSet(certifications, job.certifications)

  function handleSave() {
    if (!isDirty) return
    patchTags.mutate({
      id: jobId,
      body: {
        skills: skills.map(item => item.name),
        software: software.map(item => item.name),
        keywords: keywords.map(item => item.name),
        certifications: certifications.map(item => item.name),
      },
    })
  }

  return (
    <Card onKeyDown={preventParentFormSubmit}>
      <CardContent className="pt-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Skills & Tags</h2>
          <span className="text-xs text-slate-500">
            {skills.length + software.length + keywords.length + certifications.length} selected
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <TagColumn title="Skills" type="skills" value={skills} onChange={setSkills} />
          <TagColumn title="Software" type="software" value={software} onChange={setSoftware} />
          <TagColumn title="Keywords" type="keywords" value={keywords} onChange={setKeywords} />
          <TagColumn title="Certifications" type="certifications" value={certifications} onChange={setCertifications} />
        </div>
        <div className="flex gap-2">
          <Button type="button" onClick={handleSave} disabled={!isDirty || patchTags.isPending}>
            {patchTags.isPending ? 'Saving...' : 'Save Tags'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!isDirty || patchTags.isPending}
            onClick={() => {
              setSkills(job.skills)
              setSoftware(job.software)
              setKeywords(job.keywords)
              setCertifications(job.certifications)
            }}
          >
            Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

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
    formState: { errors, isDirty },
    reset,
  } = useForm<JobPatchFormValues>({
    resolver: zodResolver(jobPatchSchema),
  })

  // Pre-populate once data arrives
  React.useEffect(() => {
    if (!job || isDirty) return
    reset({
      job_title: job.jobTitle ?? undefined,
      job_location: job.jobLocation ?? undefined,
      is_remote: job.isRemote ?? undefined,
      job_type: (job.jobType as JobPatchFormValues['job_type']) ?? undefined,
      experience_level: (job.experienceLevel as JobPatchFormValues['experience_level']) ?? undefined,
      priority: job.priority ?? undefined,
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
  }, [isDirty, job, reset])

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
                    {getSourcePlatformLabel(job.sourcePlatform)}
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

        <JobSalaryEditor key={`salary-${id}`} jobId={id} job={job} />

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

        <JobTagsEditor key={`tags-${id}`} jobId={id} job={job} />

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
