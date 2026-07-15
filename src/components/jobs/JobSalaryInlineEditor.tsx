'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { usePatchJobSalary, type JobDetail } from '@/lib/queries'

type SalaryForm = {
  type: 'annual' | 'hourly' | ''
  min: string
  max: string
  currency: string
  text: string
}

type SalarySource = Pick<JobDetail, 'salaryType' | 'salaryMin' | 'salaryMax' | 'hourlyRateMin' | 'hourlyRateMax' | 'salaryCurrency' | 'salaryText'>

function formFromJob(job: SalarySource): SalaryForm {
  const hourly = job.salaryType === 'hourly'
  return {
    type: hourly ? 'hourly' : job.salaryType === 'annual' ? 'annual' : '',
    min: hourly
      ? (job.hourlyRateMin == null ? '' : String(Number(job.hourlyRateMin)))
      : (job.salaryMin == null ? '' : String(Math.round(job.salaryMin / 100))),
    max: hourly
      ? (job.hourlyRateMax == null ? '' : String(Number(job.hourlyRateMax)))
      : (job.salaryMax == null ? '' : String(Math.round(job.salaryMax / 100))),
    currency: job.salaryCurrency ?? 'USD',
    text: job.salaryText ?? '',
  }
}

function parseAmount(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value.replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

export function validateSalaryForm(form: SalaryForm): string {
  const min = parseAmount(form.min)
  const max = parseAmount(form.max)
  if (!/^[A-Z]{3}$/.test(form.currency)) return 'Currency must be a 3-letter ISO code.'
  if (form.type === '') return min === null && max === null ? '' : 'Choose annual or hourly for a structured range.'
  if (min === null || max === null) return 'Min and max are both required.'
  if (Number.isNaN(min) || Number.isNaN(max)) return 'Salary values must be numbers.'
  if (form.type === 'annual' && (!Number.isInteger(min) || !Number.isInteger(max))) return 'Annual salary must use whole dollars.'
  if (form.type === 'hourly' && (Number(min.toFixed(2)) !== min || Number(max.toFixed(2)) !== max)) return 'Hourly rates can have at most 2 decimal places.'
  if (min > max) return 'Min must be less than or equal to max.'
  return ''
}

export function JobSalaryInlineEditor({ jobId, job }: { jobId: string; job: JobDetail }) {
  const patchSalary = usePatchJobSalary()
  const [form, setForm] = useState(() => formFromJob(job))
  const validationMessage = validateSalaryForm(form)
  const current = formFromJob(job)
  const isDirty = JSON.stringify(form) !== JSON.stringify(current)

  function update(field: keyof SalaryForm, value: string) {
    setForm(previous => ({
      ...previous,
      [field]: field === 'currency' ? value.toUpperCase() : value,
      ...(field === 'type' && value === '' ? { min: '', max: '' } : {}),
    }))
  }

  function save() {
    if (!isDirty || validationMessage) return
    const min = parseAmount(form.min)
    const max = parseAmount(form.max)
    const body: Record<string, unknown> = {
      salary_type: form.type || null,
      salary_currency: form.currency,
      salary_text: form.text.trim() || null,
      salary_min: form.type === 'annual' && min !== null ? Math.round(min * 100) : null,
      salary_max: form.type === 'annual' && max !== null ? Math.round(max * 100) : null,
      hourly_rate_min: form.type === 'hourly' ? min : null,
      hourly_rate_max: form.type === 'hourly' ? max : null,
    }
    patchSalary.mutate(
      { id: jobId, body },
      { onSuccess: updatedJob => setForm(formFromJob(updatedJob)) },
    )
  }

  return (
    <div className="space-y-3 rounded-md border border-slate-200 p-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-xs text-slate-500">
          <span>Salary Type</span>
          <select value={form.type} onChange={event => update('type', event.target.value)} className="h-8 w-full rounded border bg-background px-2 text-sm">
            <option value="">No structured salary</option>
            <option value="annual">Annual</option>
            <option value="hourly">Hourly</option>
          </select>
        </label>
        <label className="space-y-1 text-xs text-slate-500">
          <span>Currency</span>
          <Input value={form.currency} onChange={event => update('currency', event.target.value)} maxLength={3} className="h-8 text-sm" />
        </label>
        {form.type && (
          <>
            <label className="space-y-1 text-xs text-slate-500">
              <span>{form.type === 'hourly' ? 'Hourly Min' : 'Annual Min'}</span>
              <Input inputMode="decimal" value={form.min} onChange={event => update('min', event.target.value)} className="h-8 text-sm" />
            </label>
            <label className="space-y-1 text-xs text-slate-500">
              <span>{form.type === 'hourly' ? 'Hourly Max' : 'Annual Max'}</span>
              <Input inputMode="decimal" value={form.max} onChange={event => update('max', event.target.value)} className="h-8 text-sm" />
            </label>
          </>
        )}
      </div>
      <label className="block space-y-1 text-xs text-slate-500">
        <span>Display Text</span>
        <Input value={form.text} onChange={event => update('text', event.target.value)} placeholder="$120k–$160k/yr" className="h-8 text-sm" />
      </label>
      {validationMessage && <p className="text-xs text-red-600">{validationMessage}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={!isDirty || Boolean(validationMessage) || patchSalary.isPending}>{patchSalary.isPending ? 'Saving...' : 'Save Salary'}</Button>
        <Button size="sm" variant="outline" onClick={() => setForm(current)} disabled={!isDirty || patchSalary.isPending}>Reset</Button>
      </div>
    </div>
  )
}
