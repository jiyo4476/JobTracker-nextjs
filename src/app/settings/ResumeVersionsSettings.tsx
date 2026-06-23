'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  useCreateResumeVersion,
  useDeleteResumeVersion,
  usePatchResumeVersion,
  useResumeVersions,
  type ResumeVersion,
} from '@/lib/queries'

type ResumeVersionForm = {
  label: string
  date: string
  notes: string
}

const emptyForm: ResumeVersionForm = {
  label: '',
  date: '',
  notes: '',
}

function formFromVersion(version: ResumeVersion): ResumeVersionForm {
  return {
    label: version.label,
    date: version.date ?? '',
    notes: version.notes ?? '',
  }
}

function payloadFromForm(form: ResumeVersionForm) {
  return Object.fromEntries(
    Object.entries(form)
      .map(([key, value]) => [key, value.trim()])
      .filter(([, value]) => value !== '')
  )
}

function formatDate(date: string | null) {
  if (!date) return 'No date'
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function ResumeVersionsSettings() {
  const { data: versions = [], isLoading, isError } = useResumeVersions()
  const createVersion = useCreateResumeVersion()
  const patchVersion = usePatchResumeVersion()
  const deleteVersion = useDeleteResumeVersion()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<ResumeVersionForm>(emptyForm)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingForm, setEditingForm] = useState<ResumeVersionForm>(emptyForm)

  const pending = createVersion.isPending || patchVersion.isPending || deleteVersion.isPending

  function updateForm(field: keyof ResumeVersionForm, value: string) {
    setForm(current => ({ ...current, [field]: value }))
  }

  function updateEditingForm(field: keyof ResumeVersionForm, value: string) {
    setEditingForm(current => ({ ...current, [field]: value }))
  }

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const body = payloadFromForm(form)
    if (!body.label) return
    createVersion.mutate(body, {
      onSuccess: () => {
        setForm(emptyForm)
        setShowForm(false)
      },
    })
  }

  function startEditing(version: ResumeVersion) {
    setEditingId(version.id)
    setEditingForm(formFromVersion(version))
  }

  function handlePatch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (editingId === null) return
    const body = payloadFromForm(editingForm)
    if (!body.label) return
    patchVersion.mutate({ id: editingId, body }, {
      onSuccess: () => {
        setEditingId(null)
        setEditingForm(emptyForm)
      },
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Resume Versions</CardTitle>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setShowForm(value => !value)}>
            {showForm ? 'Cancel' : 'Add version'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <form onSubmit={handleCreate} className="space-y-3 rounded border p-3">
            <Input
              value={form.label}
              onChange={e => updateForm('label', e.target.value)}
              placeholder="Label"
              required
            />
            <Input
              value={form.date}
              onChange={e => updateForm('date', e.target.value)}
              type="date"
            />
            <Textarea
              value={form.notes}
              onChange={e => updateForm('notes', e.target.value)}
              placeholder="Notes"
              className="min-h-20 text-sm"
            />
            <Button size="sm" type="submit" disabled={createVersion.isPending || !form.label.trim()}>
              {createVersion.isPending ? 'Adding...' : 'Add version'}
            </Button>
          </form>
        )}

        {isLoading ? (
          <p className="text-sm text-slate-400">Loading resume versions...</p>
        ) : isError ? (
          <p className="text-sm text-red-500">Failed to load resume versions.</p>
        ) : versions.length === 0 ? (
          <p className="text-sm text-slate-500">No resume versions yet.</p>
        ) : (
          <div className="space-y-3">
            {versions.map(version => (
              <div key={version.id} className="rounded border p-3 text-sm">
                {editingId === version.id ? (
                  <form onSubmit={handlePatch} className="space-y-3">
                    <Input
                      value={editingForm.label}
                      onChange={e => updateEditingForm('label', e.target.value)}
                      placeholder="Label"
                      required
                    />
                    <Input
                      value={editingForm.date}
                      onChange={e => updateEditingForm('date', e.target.value)}
                      type="date"
                    />
                    <Textarea
                      value={editingForm.notes}
                      onChange={e => updateEditingForm('notes', e.target.value)}
                      placeholder="Notes"
                      className="min-h-20 text-sm"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" type="submit" disabled={patchVersion.isPending || !editingForm.label.trim()}>
                        {patchVersion.isPending ? 'Saving...' : 'Save'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        disabled={patchVersion.isPending}
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-medium">{version.label}</p>
                      <p className="text-xs text-slate-400">{formatDate(version.date)}</p>
                      {version.notes && <p className="text-slate-500 whitespace-pre-wrap">{version.notes}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => startEditing(version)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500 hover:text-red-700"
                        disabled={deleteVersion.isPending}
                        onClick={() => deleteVersion.mutate(version.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
