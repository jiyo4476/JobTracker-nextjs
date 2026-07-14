'use client'

import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  usePatchJobTags,
  useTagLookup,
  type JobDetail,
  type LookupItem,
  type TagLookupType,
} from '@/lib/queries'

function sameTagSet(a: LookupItem[], b: LookupItem[]) {
  return a.map(item => item.name).sort().join('\n') === b.map(item => item.name).sort().join('\n')
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
  const [query, setQuery] = useState('')
  const { data: options = [] } = useTagLookup(type, query)
  const selectedNames = useMemo(() => new Set(value.map(item => item.name)), [value])

  function addTag(item: LookupItem) {
    if (selectedNames.has(item.name)) return
    onChange([...value, item].sort((a, b) => a.name.localeCompare(b.name)))
    setQuery('')
  }

  function addCustomTag() {
    const name = query.trim()
    if (!name || selectedNames.has(name)) return
    addTag({ id: 0, name })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-slate-700">{title}</h3>
        <span className="text-xs text-slate-500">{value.length}</span>
      </div>
      <div className="min-h-8 flex flex-wrap gap-1.5">
        {value.length === 0 ? <span className="text-xs text-slate-500">None</span> : value.map(item => (
          <Badge key={`${type}:${item.name}`} variant={type === 'skills' ? 'default' : type === 'certifications' ? 'warning' : 'secondary'} className="gap-1 pr-1">
            {item.name}
            <button type="button" onClick={() => onChange(value.filter(current => current.name !== item.name))} className="rounded-full p-0.5 hover:bg-black/10" aria-label={`Remove ${item.name}`}>
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <Input
        value={query}
        onChange={event => setQuery(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault()
            addCustomTag()
          }
        }}
        placeholder={`Add ${title.toLowerCase()}`}
      />
      {query.trim() && (
        <div className="max-h-36 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-sm">
          {options.map(option => {
            const selected = selectedNames.has(option.name)
            return (
              <button key={option.id} type="button" disabled={selected} onClick={() => addTag(option)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:text-slate-400">
                <span>{option.name}</span>
                {selected && <span className="text-xs">Selected</span>}
              </button>
            )
          })}
          {!options.some(option => option.name.toLocaleLowerCase() === query.trim().toLocaleLowerCase()) && (
            <button type="button" onClick={addCustomTag} className="w-full px-3 py-2 text-left text-sm font-medium text-blue-600 hover:bg-blue-50">
              Add “{query.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function JobTagsEditor({ jobId, job }: { jobId: string; job: JobDetail }) {
  const patchTags = usePatchJobTags()
  const [isEditing, setIsEditing] = useState(false)
  const [skills, setSkills] = useState(job.skills)
  const [software, setSoftware] = useState(job.software)
  const [keywords, setKeywords] = useState(job.keywords)
  const [certifications, setCertifications] = useState(job.certifications)

  const isDirty = !sameTagSet(skills, job.skills) ||
    !sameTagSet(software, job.software) ||
    !sameTagSet(keywords, job.keywords) ||
    !sameTagSet(certifications, job.certifications)

  function save() {
    if (!isDirty) return
    patchTags.mutate(
      {
        id: jobId,
        body: {
          skills: skills.map(item => item.name),
          software: software.map(item => item.name),
          keywords: keywords.map(item => item.name),
          certifications: certifications.map(item => item.name),
        },
      },
      { onSuccess: () => setIsEditing(false) },
    )
  }

  function cancel() {
    setSkills(job.skills)
    setSoftware(job.software)
    setKeywords(job.keywords)
    setCertifications(job.certifications)
    setIsEditing(false)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm">Skills & Tags</CardTitle>
          {!isEditing && <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing(true)}>Edit</Button>}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {isEditing ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <TagColumn title="Skills" type="skills" value={skills} onChange={setSkills} />
              <TagColumn title="Software" type="software" value={software} onChange={setSoftware} />
              <TagColumn title="Keywords" type="keywords" value={keywords} onChange={setKeywords} />
              <TagColumn title="Certifications" type="certifications" value={certifications} onChange={setCertifications} />
            </div>
            <div className="flex gap-2">
              <Button type="button" onClick={save} disabled={!isDirty || patchTags.isPending}>
                {patchTags.isPending ? 'Saving...' : 'Save'}
              </Button>
              <Button type="button" variant="outline" onClick={cancel} disabled={patchTags.isPending}>Cancel</Button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            {[
              ['Skills', job.skills, 'default'],
              ['Software', job.software, 'secondary'],
              ['Keywords', job.keywords, 'secondary'],
              ['Certifications', job.certifications, 'warning'],
            ].map(([label, items, variant]) => (
              <div key={label as string}>
                <p className="mb-1.5 text-xs font-medium text-slate-500">{label as string}</p>
                <div className="flex flex-wrap gap-1.5">
                  {(items as LookupItem[]).length === 0
                    ? <span className="text-sm text-slate-500">None</span>
                    : (items as LookupItem[]).map(item => <Badge key={`${label}:${item.name}`} variant={variant as 'default' | 'secondary' | 'warning'}>{item.name}</Badge>)}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
