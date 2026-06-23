'use client'

import { useParams, useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  useJob,
  usePatchJob,
  useDeleteJob,
  useCreateContact,
  usePatchContact,
  useDeleteContact,
  type Contact,
} from '@/lib/queries'

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

function formatSalary(min: number | null, max: number | null, type: string | null, text: string | null): string {
  if (text) return text
  if (!min && !max) return '—'
  const fmt = (v: number) =>
    type === 'hourly'
      ? `$${v.toFixed(0)}/hr`
      : `$${(v / 100).toLocaleString()}`
  if (min && max) return `${fmt(min)} – ${fmt(max)}`
  if (min) return `${fmt(min)}+`
  return `up to ${fmt(max!)}`
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString()
}

function labelify(s: string | null | undefined): string {
  if (!s) return '—'
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
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
  name: '',
  title: '',
  email: '',
  phone: '',
  linkedin_url: '',
  notes: '',
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

function contactPayload(form: ContactFormState) {
  return Object.fromEntries(
    Object.entries(form)
      .map(([key, value]) => [key, value.trim()])
      .filter(([, value]) => value !== '')
  )
}

function SkeletonLayout() {
  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <Skeleton className="h-7 w-72 mb-2" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <div className="grid grid-cols-5 gap-6">
        <div className="col-span-3 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Job Description</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {Array.from({ length: 14 }).map((_, i) => (
                <Skeleton key={i} className={`h-4 ${i % 6 === 5 ? 'w-2/3' : 'w-full'}`} />
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Skills & Tags</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-20 rounded-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="col-span-2 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Status</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {['Stage', 'Applied', 'Priority', 'Salary', 'Location', 'Type', 'Experience', 'Platform', 'Date Found'].map(label => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-slate-500">{label}</span>
                  <Skeleton className="h-4 w-28" />
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Notes</CardTitle></CardHeader>
            <CardContent><Skeleton className="h-28 w-full" /></CardContent>
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
  const patchJob = usePatchJob()
  const deleteJob = useDeleteJob()
  const createContact = useCreateContact()
  const patchContact = usePatchContact()
  const deleteContact = useDeleteContact()
  const notesRef = useRef<HTMLTextAreaElement>(null)
  const [showContactForm, setShowContactForm] = useState(false)
  const [contactForm, setContactForm] = useState<ContactFormState>(emptyContactForm)
  const [editingContactId, setEditingContactId] = useState<number | null>(null)
  const [editingContactForm, setEditingContactForm] = useState<ContactFormState>(emptyContactForm)

  if (isLoading) return <SkeletonLayout />

  if (!job) {
    return (
      <div className="p-8 text-center">
        <p className="text-lg font-medium mb-2">Job not found</p>
        <Link href="/jobs" className="text-sm text-blue-600 underline">Back to jobs</Link>
      </div>
    )
  }

  const salary = formatSalary(job.salaryMin, job.salaryMax, job.salaryType, job.salaryText)
  const allTags = [
    ...job.skills.map(s => ({ ...s, group: 'skill' })),
    ...job.software.map(s => ({ ...s, group: 'software' })),
    ...job.keywords.map(k => ({ ...k, group: 'keyword' })),
    ...job.certifications.map(c => ({ ...c, group: 'cert' })),
  ]

  function handleMarkApplied() {
    patchJob.mutate({
      id,
      body: {
        has_applied: true,
        date_applied: new Date().toISOString().slice(0, 10),
        interview_stage: 'applied',
      },
    })
  }

  function handleStageChange(e: React.ChangeEvent<HTMLSelectElement>) {
    patchJob.mutate({ id, body: { interview_stage: e.target.value } })
  }

  function handleNotesBlur() {
    const value = notesRef.current?.value ?? ''
    if (value !== (job?.notes ?? '')) {
      patchJob.mutate({ id, body: { notes: value } })
    }
  }

  function handleDelete() {
    deleteJob.mutate(id, { onSuccess: () => router.push('/jobs') })
  }

  function handlePriorityClick(star: number) {
    patchJob.mutate({ id, body: { priority: star } })
  }

  function updateContactField(field: keyof ContactFormState, value: string) {
    setContactForm(current => ({ ...current, [field]: value }))
  }

  function updateEditingContactField(field: keyof ContactFormState, value: string) {
    setEditingContactForm(current => ({ ...current, [field]: value }))
  }

  function handleCreateContact(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const body = contactPayload(contactForm)
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
    const body = contactPayload(editingContactForm)
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
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">{job.jobTitle}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{job.companyName ?? '—'}</p>
        </div>
        <div className="flex gap-2">
          {!job.hasApplied && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkApplied}
              disabled={patchJob.isPending}
            >
              Mark Applied
            </Button>
          )}
          {job.jobLink && (
            <a
              href={job.jobLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center h-7 px-3 text-xs rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-900 font-medium transition-colors"
            >
              Open Posting
            </a>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={deleteJob.isPending}
          >
            Delete
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* Left 3 cols */}
        <div className="col-span-3 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Job Description</CardTitle></CardHeader>
            <CardContent>
              {job.jobDescription ? (
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{job.jobDescription}</p>
              ) : (
                <p className="text-sm text-slate-400 italic">No description available.</p>
              )}
            </CardContent>
          </Card>

          {allTags.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Skills & Tags</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {job.skills.map(s => (
                    <Badge key={`skill-${s.id}`}>{s.name}</Badge>
                  ))}
                  {job.software.map(s => (
                    <Badge key={`sw-${s.id}`} variant="secondary">{s.name}</Badge>
                  ))}
                  {job.keywords.map(k => (
                    <Badge key={`kw-${k.id}`} variant="secondary">{k.name}</Badge>
                  ))}
                  {job.certifications.map(c => (
                    <Badge key={`cert-${c.id}`} variant="warning">{c.name}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-sm">Notes</CardTitle></CardHeader>
            <CardContent>
              <Textarea
                ref={notesRef}
                defaultValue={job.notes ?? ''}
                onBlur={handleNotesBlur}
                placeholder="Add notes…"
                className="min-h-28 resize-y text-sm"
              />
            </CardContent>
          </Card>
        </div>

        {/* Right 2 cols */}
        <div className="col-span-2 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Status</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Stage</span>
                <select
                  value={job.interviewStage ?? 'not_applied'}
                  onChange={handleStageChange}
                  className="text-sm border rounded px-2 py-1 bg-background"
                >
                  {STAGE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500">Applied</span>
                <span>{job.hasApplied ? (job.dateApplied ? formatDate(job.dateApplied) : 'Yes') : 'No'}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500">Priority</span>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      onClick={() => handlePriorityClick(star)}
                      className={cn(
                        'text-lg leading-none',
                        star <= (job.priority ?? 0) ? 'text-amber-400' : 'text-slate-300'
                      )}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500">Salary</span>
                <span>{salary}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500">Location</span>
                <span>
                  {job.jobLocation ?? '—'}
                  {job.isRemote && <Badge variant="secondary" className="ml-1 text-xs">Remote</Badge>}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500">Type</span>
                <span>{labelify(job.jobType)}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500">Experience</span>
                <span>{labelify(job.experienceLevel)}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500">Platform</span>
                <span>{labelify(job.sourcePlatform)}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500">Date Found</span>
                <span>{formatDate(job.dateFound)}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500">Date Posted</span>
                <span>{formatDate(job.datePosted)}</span>
              </div>

              {job.securityClearanceReq && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Clearance</span>
                  <Badge variant="destructive" className="text-xs">Required</Badge>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Contacts</CardTitle>
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
                  <Input
                    value={contactForm.name}
                    onChange={e => updateContactField('name', e.target.value)}
                    placeholder="Name"
                    required
                  />
                  <Input
                    value={contactForm.title}
                    onChange={e => updateContactField('title', e.target.value)}
                    placeholder="Title"
                  />
                  <Input
                    value={contactForm.email}
                    onChange={e => updateContactField('email', e.target.value)}
                    placeholder="Email"
                    type="email"
                  />
                  <Input
                    value={contactForm.phone}
                    onChange={e => updateContactField('phone', e.target.value)}
                    placeholder="Phone"
                  />
                  <Input
                    value={contactForm.linkedin_url}
                    onChange={e => updateContactField('linkedin_url', e.target.value)}
                    placeholder="LinkedIn URL"
                    type="url"
                  />
                  <Textarea
                    value={contactForm.notes}
                    onChange={e => updateContactField('notes', e.target.value)}
                    placeholder="Notes"
                    className="min-h-20 text-sm"
                  />
                  <Button size="sm" type="submit" disabled={createContact.isPending || !contactForm.name.trim()}>
                    {createContact.isPending ? 'Adding...' : 'Add contact'}
                  </Button>
                </form>
              )}

              {job.contacts.length === 0 ? (
                <p className="text-sm text-slate-400 py-2">No contacts yet.</p>
              ) : (
                job.contacts.map(c => (
                  <div key={c.id} className="text-sm border rounded p-3 space-y-2">
                    {editingContactId === c.id ? (
                      <form onSubmit={handlePatchContact} className="space-y-2">
                        <Input
                          value={editingContactForm.name}
                          onChange={e => updateEditingContactField('name', e.target.value)}
                          placeholder="Name"
                          required
                        />
                        <Input
                          value={editingContactForm.title}
                          onChange={e => updateEditingContactField('title', e.target.value)}
                          placeholder="Title"
                        />
                        <Input
                          value={editingContactForm.email}
                          onChange={e => updateEditingContactField('email', e.target.value)}
                          placeholder="Email"
                          type="email"
                        />
                        <Input
                          value={editingContactForm.phone}
                          onChange={e => updateEditingContactField('phone', e.target.value)}
                          placeholder="Phone"
                        />
                        <Input
                          value={editingContactForm.linkedin_url}
                          onChange={e => updateEditingContactField('linkedin_url', e.target.value)}
                          placeholder="LinkedIn URL"
                          type="url"
                        />
                        <Textarea
                          value={editingContactForm.notes}
                          onChange={e => updateEditingContactField('notes', e.target.value)}
                          placeholder="Notes"
                          className="min-h-20 text-sm"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" type="submit" disabled={patchContact.isPending || !editingContactForm.name.trim()}>
                            {patchContact.isPending ? 'Saving...' : 'Save'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            onClick={() => setEditingContactId(null)}
                            disabled={patchContact.isPending}
                          >
                            Cancel
                          </Button>
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
                            <a href={c.linkedinUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                              LinkedIn
                            </a>
                          )}
                          {c.notes && <p className="text-slate-500 whitespace-pre-wrap">{c.notes}</p>}
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => startEditingContact(c)}>
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-700"
                            onClick={() => handleDeleteContact(c.id)}
                            disabled={deleteContact.isPending}
                          >
                            Delete
                          </Button>
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
    </div>
  )
}
