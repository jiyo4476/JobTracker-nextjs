'use client'

import React from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/layout/PageHeader'
import { useIsAdmin, useJobs, useJobStateAction } from '@/lib/queries'
import { formatSalary } from '@/lib/salary-format'
import { formatJobLocation } from '@/lib/job-location-format'

/**
 * PAGE-017 — `Add Job` is now catalog search/select → `Save to My Jobs`.
 *
 * The previous flow POSTed a free-text manual job, which published a private listing to
 * the SHARED catalog for every user. That is exactly the boundary violation this task
 * closes, and a hybrid/private-listing model has not been designed or approved, so the
 * ordinary path is: find the posting that already exists, then track it.
 *
 * Only verified admins additionally get `Create catalog job` (`/admin/jobs/new`). The
 * control is hidden for everyone else, and `POST /api/admin/jobs` re-authorizes anyway.
 */
export default function AddJobPage() {
  const isAdmin = useIsAdmin()
  const [input, setInput] = React.useState('')
  const [query, setQuery] = React.useState('')
  const debounceTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
  }, [])

  function handleSearch(value: string) {
    setInput(value)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      debounceTimer.current = null
      setQuery(value.trim())
    }, 300)
  }

  const { data, isLoading } = useJobs({ scope: 'catalog', q: query })
  const stateAction = useJobStateAction()
  const results = data?.jobs ?? []

  return (
    <div className="p-8 max-w-4xl">
      <PageHeader
        title="Add job"
        description="Search the shared catalog and save a posting to My Jobs"
        action={isAdmin ? (
          <Link
            href="/admin/jobs/new"
            className="inline-flex items-center justify-center rounded-md bg-slate-900 text-white px-4 h-9 text-sm font-medium hover:bg-slate-700 transition-colors"
          >
            Create catalog job
          </Link>
        ) : undefined}
      />

      <div className="mb-4 rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Postings are shared by everyone. Saving one to <strong>My Jobs</strong> creates only
        your own private application state — stage, priority, notes, and contacts stay
        visible to you alone.
      </div>

      <div className="mb-4">
        <label htmlFor="catalog-search" className="block text-sm font-medium text-slate-700 mb-1.5">
          Search the catalog
        </label>
        <Input
          id="catalog-search"
          className="max-w-md"
          placeholder="Search by title or company…"
          value={input}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-3" aria-busy="true">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : results.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-600">
              {query
                ? `No catalog postings match “${query}”.`
                : 'No catalog postings yet.'}
              {isAdmin && ' You can create one with “Create catalog job”.'}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {results.map((job) => (
                <li key={job.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/jobs/${job.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                      {job.jobTitle}
                    </Link>
                    <p className="text-xs text-slate-600">
                      {job.companyName ?? '—'} · {formatJobLocation(job.jobLocation, job.isRemote)} · {formatSalary(job)}
                    </p>
                  </div>
                  {job.isTracked ? (
                    <Badge variant="secondary" className="text-xs">Already in My Jobs</Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-3 text-xs"
                      disabled={stateAction.isPending}
                      aria-label={`Save ${job.jobTitle} to My Jobs`}
                      onClick={() => stateAction.mutate({ id: job.id, action: 'save' })}
                    >
                      Save to My Jobs
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="mt-6">
        <Link href="/jobs" className="text-sm text-blue-600 underline">Back to jobs</Link>
      </div>
    </div>
  )
}
