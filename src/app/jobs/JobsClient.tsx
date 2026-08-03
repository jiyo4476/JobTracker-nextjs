'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { PageHeader } from '@/components/layout/PageHeader'
import { StageBadge } from '@/components/jobs/StageBadge'
import { TaxonomyFilters } from '@/components/jobs/TaxonomyFilters'
import { ScopeTabs, JOB_SCOPE_TABS } from '@/components/jobs/ScopeTabs'
import {
  useJobs, usePatchJobState, useJobStateAction, type JobListItem,
} from '@/lib/queries'
import { removalConfirmationText, type JobStateAction } from '@/lib/job-state'
import { taxonomyJobsParams } from '@/lib/jobs-taxonomy-filters'
import { formatSalary } from '@/lib/salary-format'
import { formatJobLocation } from '@/lib/job-location-format'
import { sourcePlatformOptions } from '@/lib/source-platforms'
import { interviewStageOptions, jobTypeOptions, experienceLevelOptions } from '@/lib/enums'
import type { JobScope, JobsParams } from '@/types/queries'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

const col = createColumnHelper<JobListItem>()

function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function isJobScope(value: string): value is JobScope {
  return JOB_SCOPE_TABS.some((tab) => tab.value === value)
}

// Allowed `sort_by` URL values; kept in sync with JobsParams via `satisfies`.
const SORT_BY_VALUES = [
  'company', 'role', 'stage', 'location', 'salary', 'found', 'priority', 'clearance',
] as const satisfies readonly NonNullable<JobsParams['sort_by']>[]
type SortBy = (typeof SORT_BY_VALUES)[number]
function isSortBy(value: string): value is SortBy {
  return (SORT_BY_VALUES as readonly string[]).includes(value)
}

const EXTRA_FILTER_PARAMS = [
  'salary_min', 'salary_max', 'priority_min',
  'company_id',
  'skill_ids', 'software_ids', 'certification_ids', 'keyword_ids',
] as const

export default function JobsClient() {
  "use no memo"

  const searchParams = useSearchParams()
  const router = useRouter()
  const qc = useQueryClient()

  // Read filter values from URL
  const scopeParam = searchParams.get('scope') ?? 'tracked'
  const scope: JobScope = isJobScope(scopeParam) ? scopeParam : 'tracked'
  const isPersonalScope = scope === 'tracked' || scope === 'hidden'
  const page = Number(searchParams.get('page') ?? '1')
  const stage = searchParams.get('stage') ?? ''
  const platform = searchParams.get('platform') ?? ''
  const jobType = searchParams.get('job_type') ?? ''
  const experienceLevel = searchParams.get('experience_level') ?? ''
  const securityClearance = searchParams.get('security_clearance') ?? ''
  const isRemote = searchParams.get('is_remote') ?? ''
  const sortByParam = searchParams.get('sort_by')
  const sortBy: SortBy = sortByParam && isSortBy(sortByParam) ? sortByParam : 'found'
  const sortOrderParam = searchParams.get('sort_order')
  const sortOrder: 'asc' | 'desc' = sortOrderParam === 'asc' ? 'asc' : 'desc'
  const urlQ = searchParams.get('q') ?? ''
  const companyIdRaw = searchParams.get('company_id')
  const parsedCompanyId = companyIdRaw && /^\d+$/.test(companyIdRaw) ? Number(companyIdRaw) : NaN
  const companyId = Number.isSafeInteger(parsedCompanyId) && parsedCompanyId > 0
    ? parsedCompanyId
    : undefined

  // Local state for the search input (debounced sync to URL)
  const [inputQ, setInputQ] = useState(urlQ)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep inputQ in sync when URL q changes externally (e.g. clear filters)
  useEffect(() => {
    setInputQ(urlQ)
  }, [urlQ])

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [])

  function updateParams(updates: Record<string, string>) {
    const next = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        next.set(key, value)
      } else {
        next.delete(key)
      }
    }
    // Reset to page 1 on filter change (unless explicitly setting page)
    if (!('page' in updates)) {
      next.delete('page')
    }
    router.replace(`/jobs?${next.toString()}`)
  }

  function handleScopeChange(nextScope: JobScope) {
    // Personal filters (stage) are meaningless in the catalog view — drop them so
    // switching to Browse Catalog doesn't silently apply a hidden stage filter.
    const updates: Record<string, string> = { scope: nextScope === 'tracked' ? '' : nextScope }
    if (nextScope === 'catalog') updates.stage = ''
    updateParams(updates)
  }

  function handleSearch(val: string) {
    setInputQ(val)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      updateParams({ q: val })
    }, 300)
  }

  function handleClearFilters() {
    setInputQ('')
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    // Preserve the current scope when clearing filters.
    router.replace(scope === 'tracked' ? '/jobs' : `/jobs?scope=${scope}`)
  }

  const [removeTarget, setRemoveTarget] = useState<JobListItem | null>(null)
  const [bulkRemoveOpen, setBulkRemoveOpen] = useState(false)
  const [bulkStage, setBulkStage] = useState('')
  const [bulkPending, setBulkPending] = useState(false)
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})

  const { data, isLoading } = useJobs({
    scope,
    page,
    company_id: companyId,
    q: urlQ,
    // Stage is a personal (user_job_state) filter — only apply it in personal scopes.
    stage: isPersonalScope ? stage : '',
    platform,
    job_type: jobType,
    experience_level: experienceLevel,
    security_clearance:
      securityClearance === 'true' || securityClearance === 'false' ? securityClearance : undefined,
    is_remote: isRemote,
    sort_by: sortBy,
    sort_order: sortOrder,
    ...taxonomyJobsParams(new URLSearchParams(searchParams.toString())),
  })
  const patchState = usePatchJobState()
  const stateAction = useJobStateAction()

  const allRows = data?.jobs ?? []
  const allRowIds = allRows.map(j => String(j.id))
  const allSelected = allRowIds.length > 0 && allRowIds.every(id => rowSelection[id])
  const someSelected = allRowIds.some(id => rowSelection[id])
  const selectedIds = allRows.filter(j => rowSelection[String(j.id)]).map(j => j.id)

  function runRowAction(id: number, action: JobStateAction) {
    stateAction.mutate({ id, action })
  }

  async function handleBulkRemove() {
    const ids = allRows.filter(j => rowSelection[String(j.id)]).map(j => j.id)
    setBulkPending(true)
    const results = await Promise.allSettled(
      ids.map(id => stateAction.mutateAsync({ id, action: 'remove' }))
    )
    const failed = results.filter(r => r.status === 'rejected').length
    const succeeded = results.length - failed
    setBulkPending(false)
    setBulkRemoveOpen(false)
    if (succeeded > 0) {
      const succeededIds = new Set(
        ids.filter((_, i) => results[i].status === 'fulfilled').map(String)
      )
      setRowSelection(prev => {
        const next = { ...prev }
        for (const id of succeededIds) delete next[id]
        return next
      })
      qc.invalidateQueries({ queryKey: ['jobs'] })
    }
    if (failed > 0) toast.error(`${failed} removal${failed !== 1 ? 's' : ''} failed`)
    else toast.success(`Removed ${succeeded} job${succeeded !== 1 ? 's' : ''} from My Jobs`)
  }

  async function handleBulkStage() {
    if (!bulkStage) return
    const ids = allRows.filter(j => rowSelection[String(j.id)]).map(j => j.id)
    setBulkPending(true)
    const results = await Promise.allSettled(
      ids.map(id => patchState.mutateAsync({ id, body: { interview_stage: bulkStage } }))
    )
    const failed = results.filter(r => r.status === 'rejected').length
    const succeeded = results.length - failed
    setBulkPending(false)
    if (succeeded > 0) {
      const succeededIds = new Set(
        ids.filter((_, i) => results[i].status === 'fulfilled').map(String)
      )
      setRowSelection(prev => {
        const next = { ...prev }
        for (const id of succeededIds) delete next[id]
        return next
      })
      setBulkStage('')
      qc.invalidateQueries({ queryKey: ['jobs'] })
    }
    if (failed > 0) toast.error(`${failed} update${failed !== 1 ? 's' : ''} failed`)
    else toast.success(`Updated ${succeeded} job${succeeded !== 1 ? 's' : ''}`)
  }

  function toggleAll(checked: boolean) {
    const next: Record<string, boolean> = { ...rowSelection }
    for (const id of allRowIds) {
      if (checked) next[id] = true
      else delete next[id]
    }
    setRowSelection(next)
  }

  const columns = [
    col.display({
      id: 'select',
      header: () => (
        <Checkbox
          checked={allSelected ? true : someSelected ? 'indeterminate' : false}
          onCheckedChange={(v) => toggleAll(!!v)}
          aria-label="Select all"
        />
      ),
      cell: (info) => (
        <Checkbox
          checked={!!rowSelection[String(info.row.original.id)]}
          onCheckedChange={(v) => {
            setRowSelection(prev => {
              const next = { ...prev }
              if (v) next[String(info.row.original.id)] = true
              else delete next[String(info.row.original.id)]
              return next
            })
          }}
          aria-label="Select row"
        />
      ),
    }),
    col.accessor('companyName', {
      id: 'company',
      header: 'Company',
      cell: (info) => <span className="font-medium">{info.getValue() ?? '—'}</span>,
    }),
    col.accessor('jobTitle', {
      id: 'role',
      header: 'Role',
      cell: (info) => (
        <Link href={`/jobs/${info.row.original.id}`} className="text-blue-600 hover:underline">
          {info.getValue()}
        </Link>
      ),
    }),
    col.accessor('interviewStage', {
      id: 'stage',
      header: 'Stage',
      cell: (info) => {
        const row = info.row.original
        if (!row.isTracked) {
          return <span className="text-xs text-slate-500 italic">Not tracked</span>
        }
        const value = info.getValue()
        return value ? <StageBadge stage={value} /> : <span className="text-slate-500">—</span>
      },
    }),
    col.accessor('jobLocation', {
      id: 'location',
      header: 'Location',
      cell: (info) => formatJobLocation(info.getValue() ?? null, info.row.original.isRemote),
    }),
    col.accessor('annualEquivalentMin', {
      id: 'salary',
      header: 'Salary',
      cell: (info) => formatSalary(info.row.original),
    }),
    col.accessor('dateFound', {
      id: 'found',
      header: 'Found',
      cell: (info) => formatDate(info.getValue() ?? null),
    }),
    col.accessor('priority', {
      id: 'priority',
      header: 'Priority',
      cell: (info) => {
        const p = info.getValue()
        return p
          ? <span className="text-amber-500">{'★'.repeat(p)}</span>
          : <span className="text-slate-600">—</span>
      },
    }),
    col.accessor('securityClearanceReq', {
      id: 'clearance',
      header: 'Clearance',
      cell: (info) => info.getValue()
        ? <span className="inline-block rounded px-1.5 py-0.5 text-xs font-medium bg-orange-100 text-orange-700">Required</span>
        : <span className="text-slate-400 text-xs">—</span>,
    }),
    col.display({
      id: 'actions',
      header: '',
      cell: (info) => {
        const row = info.row.original
        const title = row.jobTitle
        return (
          <div className="flex justify-end gap-1">
            {!row.isTracked && (
              <Button
                variant="outline" size="sm" className="h-7 px-2 text-xs"
                disabled={stateAction.isPending}
                aria-label={`Save ${title} to My Jobs`}
                onClick={() => runRowAction(row.id, 'save')}
              >
                Save to My Jobs
              </Button>
            )}
            {row.isTracked && !row.isHidden && (
              <Button
                variant="outline" size="sm" className="h-7 px-2 text-xs"
                disabled={stateAction.isPending}
                aria-label={`Hide ${title}`}
                onClick={() => runRowAction(row.id, 'hide')}
              >
                Hide
              </Button>
            )}
            {row.isTracked && row.isHidden && (
              <Button
                variant="outline" size="sm" className="h-7 px-2 text-xs"
                disabled={stateAction.isPending}
                aria-label={`Unhide ${title}`}
                onClick={() => runRowAction(row.id, 'unhide')}
              >
                Unhide
              </Button>
            )}
            {row.isTracked && (
              <Button
                variant="ghost" size="sm" className="h-7 px-2 text-xs text-red-500 hover:text-red-700"
                disabled={stateAction.isPending}
                aria-label={`Remove ${title} from My Jobs`}
                onClick={() => setRemoveTarget(row)}
              >
                Remove
              </Button>
            )}
          </div>
        )
      },
    }),
  ]

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table intentionally returns non-memoizable helpers.
  const table = useReactTable({
    data: allRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: data?.totalPages ?? -1,
  })

  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  const hasFilters = !!(
    urlQ ||
    (isPersonalScope && stage) ||
    platform ||
    jobType ||
    experienceLevel ||
    securityClearance ||
    isRemote ||
    EXTRA_FILTER_PARAMS.some(param => searchParams.has(param))
  )

  const emptyMessage = scope === 'tracked'
    ? 'No jobs saved yet. Switch to Browse Catalog to find postings and save them to My Jobs.'
    : scope === 'hidden'
      ? 'No hidden jobs.'
      : 'No jobs found'

  return (
    <div className="p-8">
      <PageHeader
        title="Jobs"
        description="Browse the shared catalog and manage the jobs you have saved"
        action={
          <Link
            href="/jobs/new"
            className="inline-flex items-center justify-center rounded-md bg-slate-900 text-white px-4 h-9 text-sm font-medium hover:bg-slate-700 transition-colors"
          >
            + Add Job
          </Link>
        }
      />

      <div className="mb-4">
        <ScopeTabs scope={scope} onScopeChange={handleScopeChange} />
      </div>

      {/* Catalog (posting-fact) filters — apply in every view */}
      <div className="flex gap-3 mb-3 flex-wrap">
        <Input
          placeholder="Search by title or company…"
          className="max-w-xs"
          value={inputQ}
          onChange={(e) => handleSearch(e.target.value)}
        />
        <select
          value={platform}
          onChange={(e) => updateParams({ platform: e.target.value })}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          aria-label="Filter by platform"
        >
          <option value="">All platforms</option>
          {sourcePlatformOptions.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
        <select
          value={jobType}
          onChange={(e) => updateParams({ job_type: e.target.value })}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          aria-label="Filter by job type"
        >
          <option value="">All types</option>
          {jobTypeOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={experienceLevel}
          onChange={(e) => updateParams({ experience_level: e.target.value })}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          aria-label="Filter by experience level"
        >
          <option value="">All levels</option>
          {experienceLevelOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={securityClearance}
          onChange={(e) => updateParams({ security_clearance: e.target.value })}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          aria-label="Filter by security clearance"
        >
          <option value="">All clearance</option>
          <option value="true">Clearance required</option>
          <option value="false">No clearance</option>
        </select>
        <select
          value={isRemote}
          onChange={(e) => updateParams({ is_remote: e.target.value })}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          aria-label="Filter by remote"
        >
          <option value="">Remote + On-site</option>
          <option value="true">Remote only</option>
          <option value="false">On-site only</option>
        </select>
        <TaxonomyFilters
          searchParams={new URLSearchParams(searchParams.toString())}
          onChange={(param, value) => updateParams({ [param]: value })}
          onClearAll={() => updateParams({
            skill_ids: '',
            software_ids: '',
            certification_ids: '',
            keyword_ids: '',
          })}
        />
        {hasFilters && (
          <Button variant="outline" size="sm" onClick={handleClearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {/* Personal (application-state) filters — only meaningful for tracked/hidden views */}
      {isPersonalScope && (
        <div className="flex items-center gap-2 mb-4 flex-wrap rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">My application</span>
          <select
            value={stage}
            onChange={(e) => updateParams({ stage: e.target.value })}
            className="h-8 rounded-md border border-input bg-background px-3 text-sm"
            aria-label="Filter by interview stage"
          >
            <option value="">All stages</option>
            {interviewStageOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Bulk action toolbar */}
      {someSelected && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm">
          <span className="font-medium">{selectedIds.length} selected</span>
          <span className="text-slate-400">·</span>
          <select
            value={bulkStage}
            onChange={(e) => setBulkStage(e.target.value)}
            className="h-7 rounded border border-slate-600 bg-slate-800 px-2 text-xs text-white"
            disabled={bulkPending}
            aria-label="Change stage for selected jobs"
          >
            <option value="">Change stage…</option>
            {interviewStageOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {bulkStage && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-3 text-xs bg-slate-700 border-slate-600 text-white hover:bg-slate-600"
              disabled={bulkPending}
              onClick={handleBulkStage}
            >
              {bulkPending ? 'Applying…' : 'Apply'}
            </Button>
          )}
          <span className="text-slate-400">·</span>
          <Button
            size="sm"
            variant="destructive"
            className="h-7 px-3 text-xs"
            disabled={bulkPending}
            onClick={() => setBulkRemoveOpen(true)}
          >
            {bulkPending ? 'Removing…' : 'Remove from My Jobs'}
          </Button>
          <span className="text-slate-400">·</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-3 text-xs text-slate-300 hover:text-white hover:bg-slate-700"
            disabled={bulkPending}
            onClick={() => setRowSelection({})}
          >
            Clear
          </Button>
        </div>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table id="jobs-panel" role="tabpanel" aria-labelledby={`scope-tab-${scope}`} className="w-full text-sm text-slate-900">
            <thead>
              <tr className="border-b text-left text-slate-600 text-xs uppercase tracking-wide">
                {table.getHeaderGroups().map((hg) =>
                  hg.headers.map((header) => (
                    <th key={header.id} className="px-4 py-3 font-medium whitespace-nowrap">
                      {header.column.columnDef.id && !['select', 'actions'].includes(header.column.columnDef.id) ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:text-slate-900"
                          onClick={() => updateParams({
                            sort_by: header.column.columnDef.id!,
                            sort_order: sortBy === header.column.columnDef.id && sortOrder === 'asc' ? 'desc' : 'asc',
                          })}
                          aria-label={`Sort by ${String(header.column.columnDef.header)}`}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <span aria-hidden="true">{sortBy === header.column.columnDef.id ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}</span>
                        </button>
                      ) : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading
                ? Array.from({ length: 12 }).map((_, i) => (
                    <tr key={i}>
                      {columns.map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <Skeleton className="h-4 w-full" />
                        </td>
                      ))}
                    </tr>
                  ))
                : table.getRowModel().rows.length === 0
                ? (
                    <tr>
                      <td colSpan={columns.length} className="px-4 py-12 text-center text-slate-600">
                        {emptyMessage}
                      </td>
                    </tr>
                  )
                : table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      className={`hover:bg-slate-50 transition-colors ${rowSelection[String(row.original.id)] ? 'bg-blue-50' : ''}`}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-4 py-3">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t flex items-center justify-between text-xs text-slate-600">
          <span>
            {total} job{total !== 1 ? 's' : ''} · page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => updateParams({ page: String(page - 1) })}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => updateParams({ page: String(page + 1) })}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>

      {/* Single-row remove-from-tracker dialog */}
      <AlertDialog open={removeTarget !== null} onOpenChange={(open) => { if (!open) setRemoveTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from My Jobs?</AlertDialogTitle>
            <AlertDialogDescription>
              {removalConfirmationText({ jobTitle: removeTarget?.jobTitle })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                if (removeTarget) {
                  runRowAction(removeTarget.id, 'remove')
                  setRemoveTarget(null)
                }
              }}
            >
              Remove from My Jobs
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk remove-from-tracker dialog */}
      <AlertDialog open={bulkRemoveOpen} onOpenChange={setBulkRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {selectedIds.length} job{selectedIds.length !== 1 ? 's' : ''} from My Jobs?</AlertDialogTitle>
            <AlertDialogDescription>
              For each selected job this permanently deletes your saved application state, any
              private contacts you added, and your interview-stage activity history. The jobs stay
              in the shared catalog.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={bulkPending}
              onClick={handleBulkRemove}
            >
              {bulkPending ? 'Removing…' : `Remove ${selectedIds.length}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
