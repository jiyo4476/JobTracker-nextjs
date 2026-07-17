'use client'

import { type FormEvent, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  useCreateUserTaxonomy,
  useDeleteUserTaxonomy,
  usePatchUserTaxonomy,
  useTagLookup,
  useUserTaxonomies,
  useUserTaxonomyGap,
  type UserTaxonomyCategory,
  type UserTaxonomyCreateVariables,
  type UserTaxonomyItem,
  type UserTaxonomyPatchVariables,
} from '@/lib/queries'

type CategoryConfig = {
  label: string
  singular: string
  description: string
  placeholder: string
  empty: string
}

const categories: UserTaxonomyCategory[] = [
  'skills',
  'software',
  'certifications',
  'keywords',
]

const categoryConfig: Record<UserTaxonomyCategory, CategoryConfig> = {
  skills: {
    label: 'My Skills',
    singular: 'skill',
    description: 'Capabilities, languages, practices, and methods you use or are learning.',
    placeholder: 'Add a skill, such as Python',
    empty: 'No skills added yet. Add capabilities you want to compare with job demand.',
  },
  software: {
    label: 'Software Experience',
    singular: 'software',
    description: 'Tools, frameworks, platforms, products, and services you have used.',
    placeholder: 'Add software, such as Docker',
    empty: 'No software experience added yet.',
  },
  certifications: {
    label: 'Certifications Held',
    singular: 'certification',
    description: 'Credentials and licenses you hold, including optional verification details.',
    placeholder: 'Add a certification, such as CISSP',
    empty: 'No certifications added yet.',
  },
  keywords: {
    label: 'Keyword Preferences',
    singular: 'keyword',
    description: 'Save job-search interests or concepts you want to exclude. These are not proficiencies.',
    placeholder: 'Add a keyword, such as remote',
    empty: 'No keyword preferences added yet.',
  },
}

type MetadataForm = {
  hasSkill: boolean
  familiarity: 'learning' | 'familiar' | 'proficient' | 'expert' | ''
  issuer: string
  earnedDate: string
  expiresAt: string
  credentialUrl: string
  preference: 'interest' | 'exclusion'
}

const emptyMetadata: MetadataForm = {
  hasSkill: true,
  familiarity: '',
  issuer: '',
  earnedDate: '',
  expiresAt: '',
  credentialUrl: '',
  preference: 'interest',
}

function itemMetadata(item: UserTaxonomyItem): MetadataForm {
  return {
    ...emptyMetadata,
    hasSkill: 'hasSkill' in item ? item.hasSkill !== false : true,
    familiarity: 'familiarity' in item ? item.familiarity ?? '' : '',
    issuer: 'issuer' in item ? item.issuer ?? '' : '',
    earnedDate: 'earnedDate' in item ? item.earnedDate ?? '' : '',
    expiresAt: 'expiresAt' in item ? item.expiresAt ?? '' : '',
    credentialUrl: 'credentialUrl' in item ? item.credentialUrl ?? '' : '',
    preference: 'preference' in item ? item.preference : 'interest',
  }
}

function certificationMetadata(metadata: MetadataForm, includeNulls: boolean) {
  const optionalValue = (value: string) => {
    const normalized = value.trim()
    return normalized || (includeNulls ? null : undefined)
  }
  return {
    issuer: optionalValue(metadata.issuer),
    earned_date: optionalValue(metadata.earnedDate),
    expires_at: optionalValue(metadata.expiresAt),
    credential_url: optionalValue(metadata.credentialUrl),
  }
}

type TaxonomyIdentity = { taxonomy_id: number } | { name: string }

function createVariables(
  category: UserTaxonomyCategory,
  identity: TaxonomyIdentity,
  metadata: MetadataForm,
): UserTaxonomyCreateVariables {
  switch (category) {
    case 'skills':
      return { category, body: { ...identity, has_skill: metadata.hasSkill } }
    case 'software':
      return { category, body: { ...identity, familiarity: metadata.familiarity || null } }
    case 'certifications':
      return { category, body: { ...identity, ...certificationMetadata(metadata, false) } }
    case 'keywords':
      return { category, body: { ...identity, preference: metadata.preference } }
  }
}

function patchVariables(
  category: UserTaxonomyCategory,
  taxonomyId: number,
  metadata: MetadataForm,
): UserTaxonomyPatchVariables {
  switch (category) {
    case 'skills':
      return { category, taxonomyId, body: { has_skill: metadata.hasSkill } }
    case 'software':
      return { category, taxonomyId, body: { familiarity: metadata.familiarity || null } }
    case 'certifications':
      return { category, taxonomyId, body: certificationMetadata(metadata, true) }
    case 'keywords':
      return { category, taxonomyId, body: { preference: metadata.preference } }
  }
}

function ProfileMetadataFields({
  category,
  metadata,
  setMetadata,
  idPrefix,
}: {
  category: UserTaxonomyCategory
  metadata: MetadataForm
  setMetadata: (value: MetadataForm) => void
  idPrefix: string
}) {
  if (category === 'skills') {
    return (
      <label htmlFor={`${idPrefix}-has-skill`} className="flex items-center gap-2 text-sm">
        <Checkbox
          id={`${idPrefix}-has-skill`}
          checked={metadata.hasSkill}
          onCheckedChange={checked => setMetadata({ ...metadata, hasSkill: checked === true })}
        />
        I currently have this skill
      </label>
    )
  }

  if (category === 'software') {
    return (
      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-familiarity`} className="text-xs font-medium text-slate-700">
          Familiarity
        </label>
        <select
          id={`${idPrefix}-familiarity`}
          value={metadata.familiarity}
          onChange={event => setMetadata({
            ...metadata,
            familiarity: event.target.value as MetadataForm['familiarity'],
          })}
          className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
        >
          <option value="">Not specified</option>
          <option value="learning">Learning</option>
          <option value="familiar">Familiar</option>
          <option value="proficient">Proficient</option>
          <option value="expert">Expert</option>
        </select>
      </div>
    )
  }

  if (category === 'keywords') {
    return (
      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-preference`} className="text-xs font-medium text-slate-700">
          Preference
        </label>
        <select
          id={`${idPrefix}-preference`}
          value={metadata.preference}
          onChange={event => setMetadata({
            ...metadata,
            preference: event.target.value as MetadataForm['preference'],
          })}
          className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
        >
          <option value="interest">Interested in</option>
          <option value="exclusion">Exclude</option>
        </select>
      </div>
    )
  }

  const fields: Array<{
    key: 'issuer' | 'earnedDate' | 'expiresAt' | 'credentialUrl'
    label: string
    type: string
    placeholder?: string
  }> = [
    { key: 'issuer', label: 'Issuer', type: 'text', placeholder: 'Issuing organization' },
    { key: 'earnedDate', label: 'Earned date', type: 'date' },
    { key: 'expiresAt', label: 'Expiration date', type: 'date' },
    { key: 'credentialUrl', label: 'Credential URL', type: 'url', placeholder: 'https://...' },
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map(field => (
        <div key={field.key} className="space-y-1">
          <label htmlFor={`${idPrefix}-${field.key}`} className="text-xs font-medium text-slate-700">
            {field.label}
          </label>
          <Input
            id={`${idPrefix}-${field.key}`}
            type={field.type}
            value={metadata[field.key]}
            placeholder={field.placeholder}
            onChange={event => setMetadata({ ...metadata, [field.key]: event.target.value })}
          />
        </div>
      ))}
    </div>
  )
}

function ItemSummary({ item }: { item: UserTaxonomyItem }) {
  if ('familiarity' in item) {
    return item.familiarity
      ? <span className="text-xs capitalize text-slate-600">{item.familiarity}</span>
      : null
  }
  if ('preference' in item) {
    return <span className="text-xs text-slate-600">{item.preference === 'interest' ? 'Interested in' : 'Exclude'}</span>
  }
  if ('issuer' in item) {
    const dates = [
      item.issuer,
      item.earnedDate ? `Earned ${item.earnedDate}` : null,
      item.expiresAt ? `Expires ${item.expiresAt}` : null,
    ].filter(Boolean)
    return dates.length > 0 ? <span className="text-xs text-slate-600">{dates.join(' · ')}</span> : null
  }
  if ('hasSkill' in item && item.hasSkill === false) {
    return <span className="text-xs text-slate-600">Learning</span>
  }
  return null
}

function ProfileItem({
  category,
  item,
  pending,
  onPatch,
  onDelete,
}: {
  category: UserTaxonomyCategory
  item: UserTaxonomyItem
  pending: boolean
  onPatch: (taxonomyId: number, metadata: MetadataForm, done: () => void) => void
  onDelete: (taxonomyId: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [metadata, setMetadata] = useState(() => itemMetadata(item))

  function cancel() {
    setMetadata(itemMetadata(item))
    setEditing(false)
  }

  function startEditing() {
    // Refresh from the latest query result when editing begins, while leaving an
    // already-open draft untouched if a background refetch arrives.
    setMetadata(itemMetadata(item))
    setEditing(true)
  }

  return (
    <li className="rounded-md border border-slate-200 p-3 text-sm">
      {editing ? (
        <form
          className="space-y-3"
          onSubmit={event => {
            event.preventDefault()
            onPatch(item.taxonomyId, metadata, () => setEditing(false))
          }}
        >
          <p className="font-medium">Edit {item.name}</p>
          <ProfileMetadataFields
            category={category}
            metadata={metadata}
            setMetadata={setMetadata}
            idPrefix={`edit-${category}-${item.taxonomyId}`}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={pending}>Save</Button>
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={cancel}>Cancel</Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="break-words font-medium">{item.name}</p>
            <ItemSummary item={item} />
            {'credentialUrl' in item && item.credentialUrl && (
              <a
                href={item.credentialUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block w-fit text-xs text-blue-700 underline"
              >
                View credential
              </a>
            )}
          </div>
          <div className="flex shrink-0 gap-1">
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={startEditing}>
              Edit <span className="sr-only">{item.name}</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-red-600 hover:text-red-800"
              disabled={pending}
              onClick={() => onDelete(item.taxonomyId)}
            >
              Remove <span className="sr-only">{item.name}</span>
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}

function ProfileSection({ category }: { category: UserTaxonomyCategory }) {
  const config = categoryConfig[category]
  const profile = useUserTaxonomies(category)
  const createItem = useCreateUserTaxonomy()
  const patchItem = usePatchUserTaxonomy()
  const deleteItem = useDeleteUserTaxonomy()
  const [input, setInput] = useState('')
  const [metadata, setMetadata] = useState<MetadataForm>(emptyMetadata)
  const lookup = useTagLookup(category, input)
  const items = useMemo(
    () => profile.data?.category === category ? profile.data.items : [],
    [category, profile.data],
  )
  const sortedItems = useMemo(
    () => [...items].sort((left, right) => left.name.localeCompare(right.name)),
    [items],
  )
  const normalizedInput = input.trim().toLocaleLowerCase()
  const selected = lookup.data?.find(option => option.name.toLocaleLowerCase() === normalizedInput)
  const duplicate = items.some(item => item.name.toLocaleLowerCase() === normalizedInput)
  const pending = createItem.isPending || patchItem.isPending || deleteItem.isPending
  const inputId = `profile-${category}-input`
  const descriptionId = `profile-${category}-description`

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = input.trim()
    if (!name || duplicate) return
    const identity = selected ? { taxonomy_id: selected.id as number } : { name }
    createItem.mutate(createVariables(category, identity, metadata), {
      onSuccess: () => {
        setInput('')
        setMetadata(emptyMetadata)
      },
    })
  }

  return (
    <section aria-labelledby={`profile-${category}-heading`} className="rounded-lg border border-slate-200 p-4">
      <div className="mb-4 space-y-1">
        <h3 id={`profile-${category}-heading`} className="font-semibold">{config.label}</h3>
        <p id={descriptionId} className="text-sm text-slate-600">{config.description}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="min-w-0 flex-1">
            <label htmlFor={inputId} className="sr-only">Add {config.singular}</label>
            <Input
              id={inputId}
              value={input}
              list={`profile-${category}-options`}
              autoComplete="off"
              aria-describedby={descriptionId}
              placeholder={config.placeholder}
              onChange={event => setInput(event.target.value)}
            />
            <datalist id={`profile-${category}-options`}>
              {(lookup.data ?? [])
                .filter(option => !items.some(item => item.taxonomyId === option.id))
                .map(option => <option key={option.id} value={option.name} />)}
            </datalist>
          </div>
          <Button type="submit" size="sm" disabled={pending || !input.trim() || duplicate}>
            {createItem.isPending ? 'Adding…' : `Add ${config.singular}`}
          </Button>
        </div>
        {duplicate && <p role="status" className="text-xs text-amber-700">{input.trim()} is already in this section.</p>}
        {lookup.isError && input.trim() && (
          <p className="text-xs text-slate-600">Suggestions are unavailable. You can still add the typed name.</p>
        )}
        <ProfileMetadataFields
          category={category}
          metadata={metadata}
          setMetadata={setMetadata}
          idPrefix={`create-${category}`}
        />
      </form>

      <div className="mt-4" aria-live="polite">
        {profile.isLoading ? (
          <p role="status" className="text-sm text-slate-600">Loading {config.label.toLowerCase()}…</p>
        ) : profile.isError ? (
          <div role="alert" className="space-y-2 text-sm text-red-700">
            <p>Could not load {config.label.toLowerCase()}.</p>
            <Button type="button" size="sm" variant="outline" onClick={() => profile.refetch()}>Retry</Button>
          </div>
        ) : sortedItems.length === 0 ? (
          <p className="text-sm text-slate-500">{config.empty}</p>
        ) : (
          <ul className="space-y-2">
            {sortedItems.map(item => (
              <ProfileItem
                key={item.taxonomyId}
                category={category}
                item={item}
                pending={pending}
                onPatch={(taxonomyId, itemMetadataForm, done) => patchItem.mutate(
                  patchVariables(category, taxonomyId, itemMetadataForm),
                  { onSuccess: done },
                )}
                onDelete={taxonomyId => deleteItem.mutate({ category, taxonomyId })}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

export function TaxonomyProfileSettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Job Qualifications &amp; Keyword Profile</CardTitle>
        <p className="text-sm text-slate-600">
          Keep capabilities, software experience, credentials, and search preferences distinct.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        {categories.map(category => <ProfileSection key={category} category={category} />)}
      </CardContent>
    </Card>
  )
}

function GapAnalysis() {
  const [category, setCategory] = useState<UserTaxonomyCategory>('skills')
  const gap = useUserTaxonomyGap(category)
  const config = categoryConfig[category]
  const recommendations = (gap.data?.category === category ? gap.data.items : [])
    .filter(item => item.matchState === 'gap')

  function selectFromKeyboard(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % categories.length
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + categories.length) % categories.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = categories.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    const nextCategory = categories[nextIndex]
    setCategory(nextCategory)
    document.getElementById(`gap-tab-${nextCategory}`)?.focus()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gap Analysis</CardTitle>
        <p className="text-sm text-slate-600">
          Compare one category at a time with demand in active saved jobs. Counts never combine categories.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div role="tablist" aria-label="Gap analysis category" className="flex flex-wrap gap-2">
          {categories.map((option, index) => (
            <Button
              key={option}
              id={`gap-tab-${option}`}
              type="button"
              role="tab"
              aria-selected={category === option}
              aria-controls="gap-category-panel"
              tabIndex={category === option ? 0 : -1}
              variant={category === option ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCategory(option)}
              onKeyDown={event => selectFromKeyboard(event, index)}
            >
              {categoryConfig[option].label}
            </Button>
          ))}
        </div>

        <section
          id="gap-category-panel"
          role="tabpanel"
          aria-labelledby={`gap-tab-${category}`}
          tabIndex={0}
          className="space-y-4 rounded-lg border border-slate-200 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
        >
          <div>
            <h3 className="font-semibold">{config.label} gaps</h3>
            <p className="text-sm text-slate-600">
              {category === 'keywords'
                ? 'Excluded keywords are tracked separately and are not recommendations.'
                : `Recommendations are ${config.label.toLowerCase()} seen in jobs but not matched by your profile.`}
            </p>
          </div>

          {gap.isLoading ? (
            <p role="status" className="text-sm text-slate-600">Loading {config.label.toLowerCase()} gaps…</p>
          ) : gap.isError ? (
            <div role="alert" className="space-y-2 text-sm text-red-700">
              <p>Could not load {config.label.toLowerCase()} gap analysis.</p>
              <Button type="button" size="sm" variant="outline" onClick={() => gap.refetch()}>Retry</Button>
            </div>
          ) : !gap.data || gap.data.category !== category ? (
            <p className="text-sm text-slate-500">No analysis is available for this category.</p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['In profile', gap.data.counts.profile],
                  ['Demanded', gap.data.counts.demanded],
                  ['Matched', gap.data.counts.matched],
                  [category === 'keywords' ? 'Recommendations' : 'Gaps', gap.data.counts.gaps],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md bg-slate-50 p-3">
                    <dt className="text-xs text-slate-600">{label}</dt>
                    <dd className="text-lg font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>
              {category === 'keywords' && gap.data.counts.excluded > 0 && (
                <p className="text-xs text-slate-600">{gap.data.counts.excluded} demanded keyword exclusions are respected.</p>
              )}
              {recommendations.length === 0 ? (
                <p className="text-sm text-slate-500">
                  {gap.data.counts.demanded === 0
                    ? `No ${config.label.toLowerCase()} demand appears in active saved jobs yet.`
                    : `No ${config.label.toLowerCase()} gaps found — your profile covers current demand.`}
                </p>
              ) : (
                <ol className="space-y-2" aria-label={`${config.label} recommendations`}>
                  {recommendations.map(item => (
                    <li key={item.taxonomyId} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm">
                      <span className="break-words">{item.name}</span>
                      <span className="shrink-0 text-xs text-slate-600">{item.jobCount} {item.jobCount === 1 ? 'job' : 'jobs'}</span>
                    </li>
                  ))}
                </ol>
              )}
              {gap.data.counts.gaps > recommendations.length && (
                <p className="text-center text-xs text-slate-600">
                  +{gap.data.counts.gaps - recommendations.length} more recommendations not shown
                </p>
              )}
            </>
          )}
        </section>
      </CardContent>
    </Card>
  )
}

export function TaxonomyProfileAndGapSettings() {
  return (
    <div className="space-y-8">
      <TaxonomyProfileSettings />
      <GapAnalysis />
    </div>
  )
}
