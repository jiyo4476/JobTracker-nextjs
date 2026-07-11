'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm, useWatch, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/layout/PageHeader'
import { useCompanies, useCreateJob } from '@/lib/queries'
import { manualJobSchema } from '@/lib/schemas'

type ManualJobFormValues = z.infer<typeof manualJobSchema>

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

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

export default function NewJobPage() {
  const router = useRouter()
  const { data: companies } = useCompanies()
  const createJob = useCreateJob()

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<ManualJobFormValues>({
    resolver: zodResolver(manualJobSchema),
  })

  const priority = useWatch({ control, name: 'priority' })

  async function onSubmit(values: ManualJobFormValues) {
    const body = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v !== undefined && v !== '')
    ) as Record<string, unknown>

    try {
      await createJob.mutateAsync(body)
      router.push('/jobs')
    } catch {
      // Error surfaced via createJob.isError / createJob.error below
    }
  }

  const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'
  const errorClass = 'mt-1 text-xs text-red-600'

  return (
    <div className="p-8 max-w-3xl">
      <PageHeader title="Add Job" description="Manually add a job listing to track" />
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="company_id" className={labelClass}>Company</label>
                {companies && companies.length > 0 ? (
                  <Controller
                    name="company_id"
                    control={control}
                    render={({ field }) => (
                      <select
                        id="company_id"
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                        className={SELECT_CLASS}
                      >
                        <option value="">— Select company —</option>
                        {companies.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    )}
                  />
                ) : (
                  <Input disabled placeholder="No companies yet — add one first" />
                )}
                {errors.company_id && <p className={errorClass}>{errors.company_id.message}</p>}
              </div>
              <div>
                <label htmlFor="job_title" className={labelClass}>Job Title *</label>
                <Input id="job_title" {...register('job_title')} placeholder="e.g. Senior Software Engineer" />
                {errors.job_title && <p className={errorClass}>{errors.job_title.message}</p>}
              </div>
            </div>

            <div>
              <label htmlFor="job_link" className={labelClass}>Job Link</label>
              <Input
                id="job_link"
                type="url"
                {...register('job_link', { setValueAs: (v) => (v === '' ? undefined : v) })}
                placeholder="https://..."
              />
              {errors.job_link && <p className={errorClass}>{errors.job_link.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="job_location" className={labelClass}>Location</label>
                <Input id="job_location" {...register('job_location')} placeholder="e.g. Austin, TX" />
                {errors.job_location && <p className={errorClass}>{errors.job_location.message}</p>}
              </div>
              <div className="flex items-end pb-1 gap-2">
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
                  {JOB_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                {errors.job_type && <p className={errorClass}>{errors.job_type.message}</p>}
              </div>
              <div>
                <label htmlFor="experience_level" className={labelClass}>Experience Level</label>
                <select id="experience_level" {...register('experience_level')} className={SELECT_CLASS}>
                  <option value="">— Select —</option>
                  {EXPERIENCE_LEVELS.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
                {errors.experience_level && <p className={errorClass}>{errors.experience_level.message}</p>}
              </div>
            </div>

            <div>
              <label className={labelClass}>Priority</label>
              <div className="flex gap-3 items-center h-9">
                {[1, 2, 3, 4, 5].map((n) => (
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
                {priority != null && (
                  <button
                    type="button"
                    onClick={() => setValue('priority', undefined)}
                    className="text-xs text-slate-600 hover:text-slate-800"
                  >
                    clear
                  </button>
                )}
              </div>
              {errors.priority && <p className={errorClass}>{errors.priority.message}</p>}
            </div>

            <div>
              <label htmlFor="salary_text" className={labelClass}>Salary</label>
              <Input id="salary_text" {...register('salary_text')} placeholder="e.g. $120k–$160k/yr" />
              {errors.salary_text && <p className={errorClass}>{errors.salary_text.message}</p>}
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

            {createJob.isError && (
              <p className="text-sm text-red-600">
                {createJob.error instanceof Error ? createJob.error.message : 'Failed to save job.'}
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={createJob.isPending}>
                {createJob.isPending ? 'Saving…' : 'Save Job'}
              </Button>
              <Link
                href="/jobs"
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
