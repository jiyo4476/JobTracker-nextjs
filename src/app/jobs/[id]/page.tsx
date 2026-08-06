'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { formatSalary } from '@/lib/salary-format'
import { JobDescriptionMarkdown } from '@/components/jobs/JobDescriptionMarkdown'
import {
  useIsAdmin,
  useJob,
  usePatchJobState,
  useJobStateAction,
  useResumeVersions,
  useCreateContact,
  usePatchContact,
  useDeleteContact,
  type Contact,
  type JobDetail,
} from '@/lib/queries'
import { removalConfirmationText } from '@/lib/job-state'
import {
  interviewStageOptions as STAGE_OPTIONS,
  jobTypeLabels,
  experienceLevelLabels,
  type InterviewStage,
} from '@/lib/enums'
import { getSourcePlatformLabel } from '@/lib/source-platforms'

function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString()
}

function displayLabel(value: string | null | undefined, labels: Record<string, string>): string {
  if (!value) return '—'
  return labels[value] ?? value
}

// ── My application editor draft ───────────────────────────────────────────────
type AppDraft = {
  interviewStage: InterviewStage
  priority: number | null
  hasApplied: boolean
  dateApplied: string
  heardBack: boolean
  referral: boolean
  coverLetterSubmitted: boolean
  resumeVersionId: number | null
  rejectionReason: string
  notes: string
}

function draftFromJob(job: JobDetail): AppDraft {
  const s = job.userState
  return {
    interviewStage: (s?.interviewStage ?? 'not_applied') as InterviewStage,
    priority: s?.priority ?? null,
    hasApplied: s?.hasApplied ?? false,
    dateApplied: s?.dateApplied ?? '',
    heardBack: s?.heardBack ?? false,
    referral: s?.referral ?? false,
    coverLetterSubmitted: s?.coverLetterSubmitted ?? false,
    resumeVersionId: s?.resumeVersionId ?? null,
    rejectionReason: s?.rejectionReason ?? '',
    notes: s?.notes ?? '',
  }
}

type ContactFormState = {
  name: string
  title: string
  email: string
  phone: string
  linkedin_url: string
  notes: string
}

const emptyContactForm: ContactFormState = {
  name: '', title: '', email: '', phone: '', linkedin_url: '', notes: '',
}

function formFromContact(contact: Contact): ContactFormState {
  return {
    name: contact.name,
    title: contact.title ?? '',
    email: contact.email ?? '',
    phone: contact.phone ?? '',
    linkedin_url: contact.linkedinUrl ?? '',
    notes: contact.notes ?? '',
  }
}

function contactCreatePayload(form: ContactFormState) {
  return Object.fromEntries(
    Object.entries(form)
      .map(([key, value]) => [key, value.trim()])
      .filter(([, value]) => value !== '')
  )
}

function contactPatchPayload(form: ContactFormState): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, raw] of Object.entries(form)) {
    const value = raw.trim()
    if (key === 'linkedin_url' && value === '') continue
    result[key] = value
  }
  return result
}

function SkeletonLayout() {
  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <Skeleton className="h-7 w-72 mb-2" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid grid-cols-5 gap-6">
        <div className="col-span-3 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Job posting</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {Array.from({ length: 14 }).map((_, i) => (
                <Skeleton key={i} className={`h-4 ${i % 6 === 5 ? 'w-2/3' : 'w-full'}`} />
              ))}
            </CardContent>
          </Card>
        </div>
        <div className="col-span-2 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">My application</CardTitle></CardHeader>
            <CardContent><Skeleton className="h-40 w-full" /></CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: job, isLoading } = useJob(id)
  const isAdmin = useIsAdmin()
  const patchState = usePatchJobState()
  const stateAction = useJobStateAction()
  const { data: resumeVersions = [] } = useResumeVersions()
  const createContact = useCreateContact()
  const patchContact = usePatchContact()
  const deleteContact = useDeleteContact()

  const [draft, setDraft] = useState<AppDraft | null>(null)
  const [seed, setSeed] = useState<string | null>(null)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [showContactForm, setShowContactForm] = useState(false)
  const [contactForm, setContactForm] = useState<ContactFormState>(emptyContactForm)
  const [editingContactId, setEditingContactId] = useState<number | null>(null)
  const [editingContactForm, setEditingContactForm] = useState<ContactFormState>(emptyContactForm)

  // Re-seed the application draft whenever fresh server state arrives, using the
  // sanctioned "adjust state while rendering" pattern (keyed on the state's updatedAt
  // stamp) rather than a setState-in-effect. A save bumps updatedAt and re-syncs.
  const stateStamp = `${id}:${job?.userState?.updatedAt ?? (job?.isTracked ? 'tracked' : 'untracked')}`
  if (job && seed !== stateStamp) {
    setSeed(stateStamp)
    setDraft(draftFromJob(job))
  }

  if (isLoading) return <SkeletonLayout />

  if (!job) {
    return (
      <div className="p-8 text-center">
        <p className="text-lg font-medium mb-2">Job not found</p>
        <Link href="/jobs" className="text-sm text-blue-600 underline">Back to jobs</Link>
      </div>
    )
  }

  const salary = formatSalary(job)
  const activeDraft = draft ?? draftFromJob(job)

  function updateDraft<K extends keyof AppDraft>(field: K, value: AppDraft[K]) {
    setDraft(current => ({ ...(current ?? draftFromJob(job!)), [field]: value }))
  }

  function saveApplication() {
    const d = activeDraft
    patchState.mutate({
      id,
      body: {
        interview_stage: d.interviewStage,
        priority: d.priority,
        has_applied: d.hasApplied,
        date_applied: d.dateApplied,
        heard_back: d.heardBack,
        referral: d.referral,
        cover_letter_submitted: d.coverLetterSubmitted,
        resume_version_id: d.resumeVersionId,
        rejection_reason: d.rejectionReason.trim() || null,
        notes: d.notes.trim() || null,
      },
    })
  }

  function saveToMyJobs() {
    patchState.mutate({ id, body: { is_hidden: false } })
  }

  function setHidden(is_hidden: boolean) {
    patchState.mutate({ id, body: { is_hidden } })
  }

  function markApplied() {
    patchState.mutate({
      id,
      body: {
        has_applied: true,
        date_applied: new Date().toISOString().slice(0, 10),
        interview_stage: 'applied',
      },
    })
  }

  function confirmRemove() {
    stateAction.mutate({ id: job!.id, action: 'remove' }, { onSuccess: () => router.push('/jobs') })
    setRemoveOpen(false)
  }

  function updateContactField(field: keyof ContactFormState, value: string) {
    setContactForm(current => ({ ...current, [field]: value }))
  }

  function updateEditingContactField(field: keyof ContactFormState, value: string) {
    setEditingContactForm(current => ({ ...current, [field]: value }))
  }

  function handleCreateContact(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const body = contactCreatePayload(contactForm)
    if (!body.name) return
    createContact.mutate(
      { jobId: id, body },
      {
        onSuccess: () => {
          setContactForm(emptyContactForm)
          setShowContactForm(false)
        },
      }
    )
  }

  function startEditingContact(contact: Contact) {
    setEditingContactId(contact.id)
    setEditingContactForm(formFromContact(contact))
  }

  function handlePatchContact(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (editingContactId === null) return
    const body = contactPatchPayload(editingContactForm)
    if (!body.name) return
    patchContact.mutate(
      { jobId: id, contactId: editingContactId, body },
      {
        onSuccess: () => {
          setEditingContactId(null)
          setEditingContactForm(emptyContactForm)
        },
      }
    )
  }

  function handleDeleteContact(contactId: number) {
    deleteContact.mutate({ jobId: id, contactId })
  }

  const contactMutationPending =
    createContact.isPending || patchContact.isPending || deleteContact.isPending

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-xl font-semibold">{job.jobTitle}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{job.companyName ?? '—'}</p>
          <div className="mt-1.5 flex items-center gap-2">
            {job.isTracked ? (
              <Badge variant="secondary" className="text-xs">
                {job.isHidden ? 'Hidden' : 'Saved to My Jobs'}
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs text-slate-500">Not tracked</Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {job.jobLink && (
            <a
              href={job.jobLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center h-9 px-3 text-sm rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-900 font-medium transition-colors"
            >
              Open Posting
            </a>
          )}
          {/* Catalog mutation affordance — verified admins only. Hidden for everyone
              else; the /api/admin/* routes re-authorize regardless. */}
          {isAdmin && (
            <Link
              href={`/admin/jobs/${id}/edit`}
              className="inline-flex items-center justify-center h-9 px-3 text-sm rounded-md border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 font-medium transition-colors"
            >
              Edit catalog posting
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Job posting (read-only catalog facts) */}
        <div className="lg:col-span-3 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Job posting</CardTitle>
              <p className="text-xs font-normal text-slate-500">Shared catalog details — same for everyone</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {job.jobDescription ? (
                <JobDescriptionMarkdown>{job.jobDescription}</JobDescriptionMarkdown>
              ) : <p className="text-sm text-slate-600 italic">No description available.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Skills &amp; tags</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {(['skills', 'software', 'certifications', 'keywords'] as const).map(group => (
                <div key={group}>
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{group}</p>
                  {job[group].length === 0 ? (
                    <p className="text-slate-500 italic text-xs">None listed.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {job[group].map(tag => (
                        <Badge key={tag.id} variant="secondary" className="text-xs">{tag.name}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Posting details</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Salary</span><span>{salary}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Location</span>
                <span>{job.jobLocation ?? '—'}{job.isRemote && <Badge variant="secondary" className="ml-1 text-xs">Remote</Badge>}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Type</span><span>{displayLabel(job.jobType, jobTypeLabels)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Experience</span><span>{displayLabel(job.experienceLevel, experienceLevelLabels)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Platform</span><span>{getSourcePlatformLabel(job.sourcePlatform)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Date Posted</span><span>{formatDate(job.datePosted)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Date Found</span><span>{formatDate(job.dateFound)}</span>
              </div>
              {job.securityClearanceReq && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Clearance</span>
                  <Badge variant="destructive" className="text-xs">Required</Badge>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* My application (personal, owner-scoped user_job_state) */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm">My application</CardTitle>
                {job.isTracked && (
                  <div className="flex gap-1.5">
                    <Button
                      variant="outline" size="sm"
                      onClick={() => setHidden(!job.isHidden)}
                      disabled={patchState.isPending}
                    >
                      {job.isHidden ? 'Unhide' : 'Hide'}
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => setRemoveOpen(true)}
                      disabled={stateAction.isPending}
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {!job.isTracked ? (
                <div className="text-center py-4 space-y-3">
                  <p className="text-slate-600">You are not tracking this job yet.</p>
                  <Button onClick={saveToMyJobs} disabled={patchState.isPending}>
                    {patchState.isPending ? 'Saving…' : 'Save to My Jobs'}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-center">
                    <label htmlFor="app_stage" className="text-slate-500">Interview stage</label>
                    <select
                      id="app_stage"
                      value={activeDraft.interviewStage}
                      onChange={e => updateDraft('interviewStage', e.target.value as InterviewStage)}
                      className="text-sm border rounded px-2 py-1 bg-background"
                    >
                      {STAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Priority</span>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map(star => (
                          <button
                            key={star}
                            type="button"
                            aria-label={`Set priority to ${star} star${star === 1 ? '' : 's'}`}
                            onClick={() => updateDraft('priority', star)}
                            className={cn('text-lg leading-none', star <= (activeDraft.priority ?? 0) ? 'text-amber-400' : 'text-slate-300')}
                          >
                            <span aria-hidden="true">★</span>
                          </button>
                        ))}
                      </div>
                      {activeDraft.priority !== null && (
                        <button type="button" onClick={() => updateDraft('priority', null)} className="text-xs text-slate-500 underline hover:text-slate-700">Clear</button>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <label htmlFor="app_applied" className="text-slate-500">Applied</label>
                    <div className="flex items-center gap-2">
                      <input id="app_applied" type="checkbox" checked={activeDraft.hasApplied} onChange={e => updateDraft('hasApplied', e.target.checked)} className="h-4 w-4" />
                      {activeDraft.hasApplied && (
                        <Input type="date" value={activeDraft.dateApplied} onChange={e => updateDraft('dateApplied', e.target.value)} className="h-8 max-w-40 text-sm" aria-label="Date applied" />
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <label htmlFor="app_heard" className="text-slate-500">Heard back</label>
                    <input id="app_heard" type="checkbox" checked={activeDraft.heardBack} onChange={e => updateDraft('heardBack', e.target.checked)} className="h-4 w-4" />
                  </div>

                  <div className="flex justify-between items-center">
                    <label htmlFor="app_referral" className="text-slate-500">Referral</label>
                    <input id="app_referral" type="checkbox" checked={activeDraft.referral} onChange={e => updateDraft('referral', e.target.checked)} className="h-4 w-4" />
                  </div>

                  <div className="flex justify-between items-center">
                    <label htmlFor="app_cover" className="text-slate-500">Cover letter submitted</label>
                    <input id="app_cover" type="checkbox" checked={activeDraft.coverLetterSubmitted} onChange={e => updateDraft('coverLetterSubmitted', e.target.checked)} className="h-4 w-4" />
                  </div>

                  <div className="flex justify-between items-center">
                    <label htmlFor="app_resume" className="text-slate-500">Resume version</label>
                    <select
                      id="app_resume"
                      value={activeDraft.resumeVersionId ?? ''}
                      onChange={e => updateDraft('resumeVersionId', e.target.value ? Number(e.target.value) : null)}
                      className="text-sm border rounded px-2 py-1 bg-background max-w-44"
                    >
                      <option value="">None</option>
                      {resumeVersions.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="app_rejection" className="text-slate-500 block mb-1">Rejection reason</label>
                    <Input id="app_rejection" value={activeDraft.rejectionReason} onChange={e => updateDraft('rejectionReason', e.target.value)} placeholder="e.g. Position filled" className="h-8 text-sm" />
                  </div>

                  <div>
                    <label htmlFor="app_notes" className="text-slate-500 block mb-1">Private notes</label>
                    <Textarea id="app_notes" value={activeDraft.notes} onChange={e => updateDraft('notes', e.target.value)} placeholder="Notes only you can see…" className="min-h-24 resize-y text-sm" />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={saveApplication} disabled={patchState.isPending}>
                      {patchState.isPending ? 'Saving…' : 'Save application'}
                    </Button>
                    {!activeDraft.hasApplied && (
                      <Button size="sm" variant="outline" onClick={markApplied} disabled={patchState.isPending}>
                        Mark applied
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* My contacts (owner-scoped user_job_contacts) */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">My contacts</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (showContactForm) setContactForm(emptyContactForm)
                    setShowContactForm(v => !v)
                  }}
                  disabled={contactMutationPending}
                >
                  {showContactForm ? 'Cancel' : 'Add contact'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {showContactForm && (
                <form onSubmit={handleCreateContact} className="space-y-2 rounded border p-3">
                  <Input aria-label="Contact name" value={contactForm.name} onChange={e => updateContactField('name', e.target.value)} placeholder="Name" required />
                  <Input aria-label="Contact title" value={contactForm.title} onChange={e => updateContactField('title', e.target.value)} placeholder="Title" />
                  <Input aria-label="Contact email" value={contactForm.email} onChange={e => updateContactField('email', e.target.value)} placeholder="Email" type="email" />
                  <Input aria-label="Contact phone" value={contactForm.phone} onChange={e => updateContactField('phone', e.target.value)} placeholder="Phone" />
                  <Input aria-label="Contact LinkedIn URL" value={contactForm.linkedin_url} onChange={e => updateContactField('linkedin_url', e.target.value)} placeholder="LinkedIn URL" type="url" />
                  <Textarea aria-label="Contact notes" value={contactForm.notes} onChange={e => updateContactField('notes', e.target.value)} placeholder="Notes" className="min-h-20 text-sm" />
                  <Button
                    size="sm"
                    type="submit"
                    aria-label="Save new contact"
                    disabled={createContact.isPending || !contactForm.name.trim()}
                  >
                    {createContact.isPending ? 'Adding...' : 'Add contact'}
                  </Button>
                </form>
              )}

              {job.contacts.length === 0 ? (
                <p className="text-sm text-slate-600 py-2">No contacts yet.</p>
              ) : (
                job.contacts.map(c => (
                  <div key={c.id} className="text-sm border rounded p-3 space-y-2">
                    {editingContactId === c.id ? (
                      <form onSubmit={handlePatchContact} className="space-y-2">
                        <Input aria-label="Edit contact name" value={editingContactForm.name} onChange={e => updateEditingContactField('name', e.target.value)} placeholder="Name" required />
                        <Input aria-label="Edit contact title" value={editingContactForm.title} onChange={e => updateEditingContactField('title', e.target.value)} placeholder="Title" />
                        <Input aria-label="Edit contact email" value={editingContactForm.email} onChange={e => updateEditingContactField('email', e.target.value)} placeholder="Email" type="email" />
                        <Input aria-label="Edit contact phone" value={editingContactForm.phone} onChange={e => updateEditingContactField('phone', e.target.value)} placeholder="Phone" />
                        <Input aria-label="Edit contact LinkedIn URL" value={editingContactForm.linkedin_url} onChange={e => updateEditingContactField('linkedin_url', e.target.value)} placeholder="LinkedIn URL" type="url" />
                        <Textarea aria-label="Edit contact notes" value={editingContactForm.notes} onChange={e => updateEditingContactField('notes', e.target.value)} placeholder="Notes" className="min-h-20 text-sm" />
                        <div className="flex gap-2">
                          <Button size="sm" type="submit" disabled={patchContact.isPending || !editingContactForm.name.trim()}>
                            {patchContact.isPending ? 'Saving...' : 'Save'}
                          </Button>
                          <Button variant="outline" size="sm" type="button" onClick={() => setEditingContactId(null)} disabled={patchContact.isPending}>Cancel</Button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <div className="space-y-0.5">
                          <p className="font-medium">{c.name}</p>
                          {c.title && <p className="text-slate-500">{c.title}</p>}
                          {c.email && <p className="text-slate-500">{c.email}</p>}
                          {c.phone && <p className="text-slate-500">{c.phone}</p>}
                          {c.linkedinUrl && (
                            <a href={c.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">LinkedIn</a>
                          )}
                          {c.notes && <p className="text-slate-500 whitespace-pre-wrap">{c.notes}</p>}
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => startEditingContact(c)}>Edit</Button>
                          <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => handleDeleteContact(c.id)} disabled={deleteContact.isPending}>Delete</Button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from My Jobs?</AlertDialogTitle>
            <AlertDialogDescription>
              {removalConfirmationText({ jobTitle: job.jobTitle, contactCount: job.contacts.length })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={confirmRemove}>
              Remove from My Jobs
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
