'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/layout/PageHeader'
import { useCompanies, useCreateJob } from '@/lib/queries'

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

  const [jobTitle, setJobTitle] = useState('')
  const [companyId, setCompanyId] = useState<string>('')
  const [jobLink, setJobLink] = useState('')
  const [location, setLocation] = useState('')
  const [isRemote, setIsRemote] = useState(false)
  const [jobType, setJobType] = useState('')
  const [experienceLevel, setExperienceLevel] = useState('')
  const [priority, setPriority] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [titleError, setTitleError] = useState('')
  const [submitError, setSubmitError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setTitleError('')
    setSubmitError('')

    if (!jobTitle.trim()) {
      setTitleError('Job title is required.')
      return
    }

    const body: Record<string, unknown> = { job_title: jobTitle.trim() }
    if (companyId) body.company_id = Number(companyId)
    if (jobLink.trim()) body.job_link = jobLink.trim()
    if (location.trim()) body.job_location = location.trim()
    if (isRemote) body.is_remote = true
    if (jobType) body.job_type = jobType
    if (experienceLevel) body.experience_level = experienceLevel
    if (priority) body.priority = Number(priority)
    if (notes.trim()) body.notes = notes.trim()

    try {
      await createJob.mutateAsync(body)
      router.push('/jobs')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save job.')
    }
  }

  const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'

  return (
    <div className="p-8 max-w-3xl">
      <PageHeader title="Add Job" description="Manually add a job listing to track" />
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="company" className={labelClass}>Company</label>
                {companies && companies.length > 0 ? (
                  <select
                    id="company"
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">— Select company —</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                ) : (
                  <Input disabled placeholder="No companies yet — add one first" />
                )}
              </div>
              <div>
                <label htmlFor="jobTitle" className={labelClass}>Job Title *</label>
                <Input
                  id="jobTitle"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="e.g. Senior Software Engineer"
                />
                {titleError && <p className="mt-1 text-xs text-red-600">{titleError}</p>}
              </div>
            </div>

            <div>
              <label htmlFor="jobLink" className={labelClass}>Job Link</label>
              <Input
                id="jobLink"
                type="url"
                value={jobLink}
                onChange={(e) => setJobLink(e.target.value)}
                placeholder="https://..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="location" className={labelClass}>Location</label>
                <Input
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Austin, TX"
                />
              </div>
              <div className="flex items-end pb-1 gap-2">
                <input
                  id="isRemote"
                  type="checkbox"
                  checked={isRemote}
                  onChange={(e) => setIsRemote(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <label htmlFor="isRemote" className="text-sm font-medium text-slate-700">Remote</label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="jobType" className={labelClass}>Job Type</label>
                <select
                  id="jobType"
                  value={jobType}
                  onChange={(e) => setJobType(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">— Select —</option>
                  {JOB_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="experienceLevel" className={labelClass}>Experience Level</label>
                <select
                  id="experienceLevel"
                  value={experienceLevel}
                  onChange={(e) => setExperienceLevel(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">— Select —</option>
                  {EXPERIENCE_LEVELS.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass}>Priority</label>
              <div className="flex gap-3">
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n} className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="priority"
                      value={n}
                      checked={priority === String(n)}
                      onChange={() => setPriority(String(n))}
                      className="h-4 w-4"
                    />
                    {n}
                  </label>
                ))}
                {priority && (
                  <button
                    type="button"
                    onClick={() => setPriority('')}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    clear
                  </button>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="notes" className={labelClass}>Notes</label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any notes about this job…"
                className="min-h-[100px]"
              />
            </div>

            {submitError && (
              <p className="text-sm text-red-600">{submitError}</p>
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
