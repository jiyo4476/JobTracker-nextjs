'use client'

import * as React from 'react'
import { Award, Lightbulb, Tag, Wrench, X } from 'lucide-react'
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
  type TagsPatchResponse,
} from '@/lib/queries'
import { cn } from '@/lib/utils'

type TaxonomyValues = Record<TagLookupType, LookupItem[]>

const TAXONOMY_GROUPS = [
  {
    type: 'skills',
    label: 'Skills',
    singular: 'skill',
    empty: 'No skills selected.',
    icon: Lightbulb,
    badgeVariant: 'default',
    accentClass: 'border-l-slate-900',
  },
  {
    type: 'software',
    label: 'Software',
    singular: 'software tool',
    empty: 'No software selected.',
    icon: Wrench,
    badgeVariant: 'secondary',
    accentClass: 'border-l-violet-600',
  },
  {
    type: 'certifications',
    label: 'Certifications',
    singular: 'certification',
    empty: 'No certifications selected.',
    icon: Award,
    badgeVariant: 'success',
    accentClass: 'border-l-emerald-600',
  },
  {
    type: 'keywords',
    label: 'Keywords',
    singular: 'keyword',
    empty: 'No keywords selected.',
    icon: Tag,
    badgeVariant: 'warning',
    accentClass: 'border-l-amber-600',
  },
] as const satisfies ReadonlyArray<{
  type: TagLookupType
  label: string
  singular: string
  empty: string
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  badgeVariant: 'default' | 'secondary' | 'success' | 'warning'
  accentClass: string
}>

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase()
}

function sortItems(items: LookupItem[]) {
  return [...items].sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }))
}

function valuesFromJob(job: Pick<JobDetail, TagLookupType>): TaxonomyValues {
  return {
    skills: sortItems(job.skills),
    software: sortItems(job.software),
    certifications: sortItems(job.certifications),
    keywords: sortItems(job.keywords),
  }
}

function valuesSignature(values: TaxonomyValues) {
  return TAXONOMY_GROUPS.map(({ type }) => (
    `${type}:${values[type].map(item => `${item.id}:${normalizeName(item.name)}`).join('|')}`
  )).join('\n')
}

function sameValues(left: TaxonomyValues, right: TaxonomyValues) {
  return TAXONOMY_GROUPS.every(({ type }) => {
    const leftNames = left[type].map(item => normalizeName(item.name)).sort()
    const rightNames = right[type].map(item => normalizeName(item.name)).sort()
    return leftNames.length === rightNames.length && leftNames.every((name, index) => name === rightNames[index])
  })
}

function valuesFromResponse(response: TagsPatchResponse) {
  return valuesFromJob(response)
}

function CategoryEditor({
  type,
  label,
  singular,
  empty,
  icon: Icon,
  badgeVariant,
  accentClass,
  value,
  onChange,
}: (typeof TAXONOMY_GROUPS)[number] & {
  value: LookupItem[]
  onChange: (items: LookupItem[]) => void
}) {
  const [query, setQuery] = React.useState('')
  const lookup = useTagLookup(type, query)
  const options = lookup.data ?? []
  const normalizedSelected = React.useMemo(
    () => new Set(value.map(item => normalizeName(item.name))),
    [value],
  )
  const trimmedQuery = query.trim()
  const normalizedQuery = normalizeName(trimmedQuery)
  const exactOptionExists = options.some(option => normalizeName(option.name) === normalizedQuery)
  const listId = `job-taxonomy-${type}-options`
  const headingId = `job-taxonomy-${type}-heading`

  function addItem(item: LookupItem) {
    if (normalizedSelected.has(normalizeName(item.name))) return
    onChange(sortItems([...value, item]))
    setQuery('')
  }

  function addCustomItem() {
    if (!trimmedQuery || normalizedSelected.has(normalizedQuery)) return
    addItem({ id: 0, name: trimmedQuery })
  }

  return (
    <section
      aria-labelledby={headingId}
      className={cn('space-y-3 rounded-md border border-slate-200 border-l-4 p-4', accentClass)}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id={headingId} className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Icon className="h-4 w-4" aria-hidden />
          {label}
        </h3>
        <span className="text-xs text-slate-500" aria-label={`${value.length} ${label.toLowerCase()} selected`}>
          {value.length} selected
        </span>
      </div>

      <div className="min-h-8 flex flex-wrap gap-1.5" aria-live="polite">
        {value.length === 0 ? (
          <span className="text-sm text-slate-500">{empty}</span>
        ) : value.map(item => (
          <Badge key={`${type}:${normalizeName(item.name)}`} variant={badgeVariant} className="gap-1 pr-1">
            {item.name}
            <button
              type="button"
              onClick={() => onChange(value.filter(current => normalizeName(current.name) !== normalizeName(item.name)))}
              className="rounded-full p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-1 hover:bg-black/10"
              aria-label={`Remove ${item.name} from ${label}`}
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </Badge>
        ))}
      </div>

      <div className="relative">
        <label htmlFor={`job-taxonomy-${type}-input`} className="sr-only">
          Search or add {label.toLowerCase()}
        </label>
        <Input
          id={`job-taxonomy-${type}-input`}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={Boolean(trimmedQuery)}
          value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault()
              addCustomItem()
            } else if (event.key === 'Escape') {
              setQuery('')
            }
          }}
          placeholder={`Search or add a ${singular}`}
        />

        {trimmedQuery && (
          <div id={listId} role="listbox" aria-label={`${label} suggestions`} className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
            {lookup.isLoading && <p className="px-3 py-2 text-sm text-slate-500">Loading {label.toLowerCase()}…</p>}
            {lookup.isError && (
              <div role="alert" className="flex items-center justify-between gap-2 px-3 py-2 text-sm text-red-700">
                <span>Could not load {label.toLowerCase()}.</span>
                <Button type="button" variant="outline" size="sm" onClick={() => lookup.refetch()}>Retry</Button>
              </div>
            )}
            {!lookup.isLoading && !lookup.isError && options.length === 0 && (
              <p className="px-3 py-2 text-sm text-slate-500">No matching {label.toLowerCase()}.</p>
            )}
            {!lookup.isLoading && !lookup.isError && options.map(option => {
              const selected = normalizedSelected.has(normalizeName(option.name))
              return (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={selected}
                  onClick={() => addItem(option)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900 hover:bg-slate-50 disabled:text-slate-400 disabled:hover:bg-white"
                >
                  <span>{option.name}</span>
                  {selected && <span className="text-xs">Selected</span>}
                </button>
              )
            })}
            {!normalizedSelected.has(normalizedQuery) && !exactOptionExists && (
              <button
                type="button"
                role="option"
                aria-selected="false"
                onClick={addCustomItem}
                className="w-full px-3 py-2 text-left text-sm font-medium text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-700 hover:bg-blue-50"
              >
                Create {singular} “{trimmedQuery}”
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function CategoryReadOnly({
  type,
  label,
  empty,
  icon: Icon,
  badgeVariant,
  accentClass,
  value,
}: (typeof TAXONOMY_GROUPS)[number] & { value: LookupItem[] }) {
  const headingId = `job-taxonomy-${type}-readonly-heading`
  return (
    <section aria-labelledby={headingId} className={cn('space-y-2 border-l-4 pl-3', accentClass)}>
      <h3 id={headingId} className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <Icon className="h-4 w-4" aria-hidden />
        {label}
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {value.length === 0
          ? <span className="text-sm text-slate-500">{empty}</span>
          : value.map(item => <Badge key={`${type}:${normalizeName(item.name)}`} variant={badgeVariant}>{item.name}</Badge>)}
      </div>
    </section>
  )
}

export function JobTaxonomyCard({
  jobId,
  job,
  mode = 'inline',
  onDirtyChange,
}: {
  jobId: string
  job: JobDetail
  mode?: 'inline' | 'form'
  onDirtyChange?: (dirty: boolean) => void
}) {
  const patchTags = usePatchJobTags()
  const incoming = React.useMemo(
    () => valuesFromJob(job),
    [job],
  )
  const incomingSignature = valuesSignature(incoming)
  const [draftOverride, setDraftOverride] = React.useState<TaxonomyValues | null>(null)
  const [savedOverride, setSavedOverride] = React.useState<{
    sourceSignature: string
    values: TaxonomyValues
  } | null>(null)
  const saved = savedOverride?.sourceSignature === incomingSignature ? savedOverride.values : incoming
  const draft = draftOverride ?? saved
  const [isEditing, setIsEditing] = React.useState(mode === 'form')
  const isDirty = !sameValues(draft, saved)

  React.useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])
  React.useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  function resetDraft() {
    setDraftOverride(null)
  }

  function save() {
    if (!isDirty) return
    patchTags.mutate(
      {
        id: jobId,
        body: {
          skills: draft.skills.map(item => item.name),
          software: draft.software.map(item => item.name),
          certifications: draft.certifications.map(item => item.name),
          keywords: draft.keywords.map(item => item.name),
        },
      },
      {
        onSuccess: response => {
          const next = valuesFromResponse(response)
          setSavedOverride({ sourceSignature: incomingSignature, values: next })
          setDraftOverride(null)
          if (mode === 'inline') setIsEditing(false)
        },
      },
    )
  }

  const showEditor = mode === 'form' || isEditing

  return (
    <Card aria-label="Job qualifications and keywords">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm">Job qualifications &amp; keywords</CardTitle>
            <p className="mt-1 text-xs text-slate-500">Skills, Software, Certifications, and Keywords stay in separate categories.</p>
          </div>
          {!showEditor && (
            <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing(true)}>
              Edit categories
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2" data-testid="taxonomy-groups">
          {TAXONOMY_GROUPS.map(group => showEditor ? (
            <CategoryEditor
              key={group.type}
              {...group}
              value={draft[group.type]}
              onChange={items => setDraftOverride(current => ({
                ...(current ?? draft),
                [group.type]: items,
              }))}
            />
          ) : (
            <CategoryReadOnly key={group.type} {...group} value={saved[group.type]} />
          ))}
        </div>

        {showEditor && (
          <div className="space-y-3">
            {patchTags.isError && (
              <p role="alert" className="text-sm text-red-700">
                {patchTags.error instanceof Error ? patchTags.error.message : 'Could not save job qualifications and keywords.'}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={save} disabled={!isDirty || patchTags.isPending}>
                {patchTags.isPending ? 'Saving…' : 'Save categories'}
              </Button>
              {mode === 'inline' ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    resetDraft()
                    setIsEditing(false)
                  }}
                  disabled={patchTags.isPending}
                >
                  Cancel
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={resetDraft} disabled={!isDirty || patchTags.isPending}>
                  Reset categories
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
