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
import { useJobs, useDeleteJob, usePatchJob, type JobListItem } from '@/lib/queries'
import { useQueryClient } from '@tanstack/react-query'

const col = createColumnHelper<JobListItem>()

function formatSalary(min: number | null, max: number | null): string {
  if (!min && !max) return '—'
  // Salary values are stored as cents; divide by 100 for dollars, then 1,000 for "k".
  const k = (v: number) => `$${Math.round(v / 100_000)}k`
  if (min && max) return `${k(min)}–${k(max)}`
  if (min) return `${k(min)}+`
  return `up to ${k(max!)}`
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const STAGES = ['', 'not_applied', 'applied', 'phone_screen', 'technical_screen', 'onsite', 'offer_received', 'rejected', 'withdrawn']
const PLATFORMS = ['', 'linkedin', 'indeed', 'glassdoor', 'dice', 'lever', 'greenhouse', 'workday', 'angellist', 'direct', 'other']
const JOB_TYPES = ['', 'full_time', 'part_time', 'contract', 'internship', 'temp', 'freelance']
const EXTRA_FILTER_PARAMS = ['salary_min', 'salary_max', 'priority_min', 'skill_ids'] as const

export default function JobsClient() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const qc = useQueryClient()

  // Read filter values from URL
  const page = Number(searchParams.get('page') ?? '1')
  const stage = searchParams.get('stage') ?? ''
  const platform = searchParams.get('platform') ?? ''
  const jobType = searchParams.get('job_type') ?? ''
  const isRemote = searchParams.get('is_remote') ?? ''
  const urlQ = searchParams.get('q') ?? ''

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
    router.replace('/jobs')
  }

  const [deleteTarget, setDeleteTarget] = useState<number | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkStage, setBulkStage] = useState('')
  const [bulkPending, setBulkPending] = useState(false)
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})

  const { data, isLoading } = useJobs({
    page,
    q: urlQ,
    stage,
    platform,
    job_type: jobType,
    is_remote: isRemote,
  })
  const deleteJob = useDeleteJob()
  const patchJob = usePatchJob()

  const selectedIds = Object.entries(rowSelection)
    .filter(([, v]) => v)
    .map(([id]) => Number(id))

  async function handleBulkDelete() {
    setBulkPending(true)
    try {
      await Promise.all(selectedIds.map(id => deleteJob.mutateAsync(id)))
      setRowSelection({})
      qc.invalidateQueries({ queryKey: ['jobs'] })
    } finally {
      setBulkPending(false)
      setBulkDeleteOpen(false)
    }
  }

  async function handleBulkStage() {
    if (!bulkStage) return
    setBulkPending(true)
    try {
      await Promise.all(
        selectedIds.map(id => patchJob.mutateAsync({ id, body: { interview_stage: bulkStage } }))
      )
      setRowSelection({})
      setBulkStage('')
      qc.invalidateQueries({ queryKey: ['jobs'] })
    } finally {
      setBulkPending(false)
    }
  }

  const allRows = data?.jobs ?? []
  const allRowIds = allRows.map(j => String(j.id))
  const allSelected = allRowIds.length > 0 && allRowIds.every(id => rowSelection[id])
  const someSelected = allRowIds.some(id => rowSelection[id])

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
          checked={allSelected}
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
      header: 'Company',
      cell: (info) => <span className="font-medium">{info.getValue() ?? '—'}</span>,
    }),
    col.accessor('jobTitle', {
      header: 'Role',
      cell: (info) => (
        <Link href={`/jobs/${info.row.original.id}`} className="text-blue-600 hover:underline">
          {info.getValue()}
        </Link>
      ),
    }),
    col.accessor('interviewStage', {
      header: 'Stage',
      cell: (info) => <StageBadge stage={info.getValue()} />,
    }),
    col.accessor('jobLocation', {
      header: 'Location',
      cell: (info) => (
        <span>
          {info.getValue() ?? '—'}
          {info.row.original.isRemote && (
            <span className="ml-1 text-xs text-slate-400">(remote)</span>
          )}
        </span>
      ),
    }),
    col.accessor('annualEquivalentMin', {
      header: 'Salary',
      cell: (info) => formatSalary(info.getValue() ?? null, info.row.original.annualEquivalentMax ?? null),
    }),
    col.accessor('dateFound', {
      header: 'Found',
      cell: (info) => formatDate(info.getValue() ?? null),
    }),
    col.accessor('priority', {
      header: 'Priority',
      cell: (info) => {
        const p = info.getValue()
        return p
          ? <span className="text-amber-500">{'★'.repeat(p)}</span>
          : <span className="text-slate-300">—</span>
      },
    }),
    col.display({
      id: 'actions',
      header: '',
      cell: (info) => (
        <Button
          variant="ghost"
          size="sm"
          className="text-red-500 hover:text-red-700 h-7 px-2"
          disabled={deleteJob.isPending}
          onClick={() => setDeleteTarget(info.row.original.id)}
        >
          Delete
        </Button>
      ),
    }),
  ]

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
    stage ||
    platform ||
    jobType ||
    isRemote ||
    EXTRA_FILTER_PARAMS.some(param => searchParams.has(param))
  )

  return (
    <div className="p-8">
      <PageHeader
        title="Jobs"
        description="Browse and manage your saved job listings"
        action={
          <Link
            href="/jobs/new"
            className="inline-flex items-center justify-center rounded-md bg-slate-900 text-white px-4 h-9 text-sm font-medium hover:bg-slate-700 transition-colors"
          >
            + Add Job
          </Link>
        }
      />

      <div className="flex gap-3 mb-4 flex-wrap">
        <Input
          placeholder="Search by title or company…"
          className="max-w-xs"
          value={inputQ}
          onChange={(e) => handleSearch(e.target.value)}
        />
        <select
          value={stage}
          onChange={(e) => updateParams({ stage: e.target.value })}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          {STAGES.map((s) => (
            <option key={s} value={s}>{s ? s.replace(/_/g, ' ') : 'All stages'}</option>
          ))}
        </select>
        <select
          value={platform}
          onChange={(e) => updateParams({ platform: e.target.value })}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>{p || 'All platforms'}</option>
          ))}
        </select>
        <select
          value={jobType}
          onChange={(e) => updateParams({ job_type: e.target.value })}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          {JOB_TYPES.map((t) => (
            <option key={t} value={t}>{t ? t.replace(/_/g, ' ') : 'All types'}</option>
          ))}
        </select>
        <select
          value={isRemote}
          onChange={(e) => updateParams({ is_remote: e.target.value })}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Remote + On-site</option>
          <option value="true">Remote only</option>
          <option value="false">On-site only</option>
        </select>
        {hasFilters && (
          <Button variant="outline" size="sm" onClick={handleClearFilters}>
            Clear filters
          </Button>
        )}
      </div>

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
          >
            <option value="">Change stage…</option>
            {STAGES.filter(Boolean).map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
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
            onClick={() => setBulkDeleteOpen(true)}
          >
            {bulkPending ? 'Deleting…' : 'Delete'}
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500 text-xs uppercase tracking-wide">
                {table.getHeaderGroups().map((hg) =>
                  hg.headers.map((header) => (
                    <th key={header.id} className="px-4 py-3 font-medium whitespace-nowrap">
                      {flexRender(header.column.columnDef.header, header.getContext())}
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
                      <td colSpan={columns.length} className="px-4 py-12 text-center text-slate-400">
                        No jobs found
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

        <div className="px-4 py-3 border-t flex items-center justify-between text-xs text-slate-500">
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

      {/* Single-row delete dialog */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this job?</AlertDialogTitle>
            <AlertDialogDescription>
              The listing will be soft-deleted and hidden from the default view. You can restore it later with the API.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                if (deleteTarget !== null) {
                  deleteJob.mutate(deleteTarget)
                  setDeleteTarget(null)
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete dialog */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={(open) => { if (!open) setBulkDeleteOpen(false) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.length} job{selectedIds.length !== 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedIds.length} listing{selectedIds.length !== 1 ? 's' : ''} will be soft-deleted and hidden from the default view.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={bulkPending}
              onClick={handleBulkDelete}
            >
              {bulkPending ? 'Deleting…' : `Delete ${selectedIds.length}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
