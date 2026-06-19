'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { PageHeader } from '@/components/layout/PageHeader'
import { StageBadge } from '@/components/jobs/StageBadge'
import { useJobs, useDeleteJob, type JobListItem } from '@/lib/queries'

const col = createColumnHelper<JobListItem>()

function formatSalary(min: number | null, max: number | null): string {
  if (!min && !max) return '—'
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

export default function JobsPage() {
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [stage, setStage] = useState('')
  const [platform, setPlatform] = useState('')
  const [jobType, setJobType] = useState('')
  const [isRemote, setIsRemote] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleSearch(val: string) {
    setQ(val)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      setDebouncedQ(val)
      setPage(1)
    }, 300)
  }

  const { data, isLoading } = useJobs({
    page,
    q: debouncedQ,
    stage,
    platform,
    job_type: jobType,
    is_remote: isRemote,
  })
  const deleteJob = useDeleteJob()

  const columns = [
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
    data: data?.jobs ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: data?.totalPages ?? -1,
  })

  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

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
          value={q}
          onChange={(e) => handleSearch(e.target.value)}
        />
        <select
          value={stage}
          onChange={(e) => { setStage(e.target.value); setPage(1) }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          {STAGES.map((s) => (
            <option key={s} value={s}>{s ? s.replace(/_/g, ' ') : 'All stages'}</option>
          ))}
        </select>
        <select
          value={platform}
          onChange={(e) => { setPlatform(e.target.value); setPage(1) }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>{p || 'All platforms'}</option>
          ))}
        </select>
        <select
          value={jobType}
          onChange={(e) => { setJobType(e.target.value); setPage(1) }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          {JOB_TYPES.map((t) => (
            <option key={t} value={t}>{t ? t.replace(/_/g, ' ') : 'All types'}</option>
          ))}
        </select>
        <select
          value={isRemote}
          onChange={(e) => { setIsRemote(e.target.value); setPage(1) }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Remote + On-site</option>
          <option value="true">Remote only</option>
          <option value="false">On-site only</option>
        </select>
      </div>

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
                    <tr key={row.id} className="hover:bg-slate-50 transition-colors">
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
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>
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
    </div>
  )
}
