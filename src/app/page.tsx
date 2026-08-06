'use client'

import { Suspense } from 'react'

import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/layout/PageHeader'
import { useStats, useActivity } from '@/lib/queries'
import { StageBadge } from '@/components/jobs/StageBadge'
import { TaxonomyByAuthorizationChart } from '@/components/dashboard/TaxonomyByAuthorizationChart'

// Personal application KPIs (caller's user_job_state) — NOT the global catalog size.
// `Tracked Jobs` is the count of jobs the signed-in user has saved to their tracker.
const KPI_LABELS = ['Tracked Jobs', 'Applied', 'Active Interviews', 'Stale Listings'] as const

function KpiSkeleton() {
  return <Skeleton className="h-9 w-16" />
}

function ChartSkeleton({ height }: { height: string }) {
  return <Skeleton className={`${height} w-full`} />
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export default function DashboardPage() {
  const { data, isLoading, isError } = useStats()
  const { data: activityData, isLoading: activityLoading, isError: activityError } = useActivity()

  // Top-level KPIs are personal (scope: 'personal'); catalog supply metrics live
  // under `data.catalog.*` and are labeled as global where charted below.
  const kpiValues = data
    ? [data.trackedJobs, data.applied, data.activeInterviews, data.staleListings]
    : null
  // A personal query is disabled until the identity provider validates /api/me.
  // React Query reports that state with no data but not necessarily `isLoading`, so
  // treat it as pending and never enter data-only render branches during prerender.
  const statsPending = isLoading || (!data && !isError)
  const activityPending = activityLoading || (!activityData && !activityError)

  return (
    <div className="p-8">
      <PageHeader title="Dashboard" description="Your job search at a glance" />

      <div className="grid grid-cols-4 gap-4 mb-8">
        {KPI_LABELS.map((label, i) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsPending ? (
                <KpiSkeleton />
              ) : isError ? (
                <span className="text-sm text-red-500">—</span>
              ) : (
                <span className="text-3xl font-bold">{kpiValues![i]}</span>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Suspense fallback={<ChartSkeleton height="h-[420px]" />}>
        <TaxonomyByAuthorizationChart />
      </Suspense>

      <div className="grid grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Top 15 Skills</CardTitle>
            <p className="text-xs font-normal text-slate-500">Global catalog demand across all postings</p>
          </CardHeader>
          <CardContent>
            {statsPending ? <ChartSkeleton height="h-56" /> : isError ? (
              <p className="text-sm text-red-500">Failed to load</p>
            ) : (
              <ResponsiveContainer width="100%" height={224}>
                <BarChart data={data!.catalog.topSkills} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="jobCount" fill="#6366f1" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Application Funnel</CardTitle>
            <p className="text-xs font-normal text-slate-500">Your tracked applications by stage</p>
          </CardHeader>
          <CardContent>
            {statsPending ? <ChartSkeleton height="h-56" /> : isError ? (
              <p className="text-sm text-red-500">Failed to load</p>
            ) : (
              <ResponsiveContainer width="100%" height={224}>
                <BarChart data={data!.stageCounts} margin={{ left: 8, right: 16 }}>
                  <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#6366f1" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Jobs Found per Week</CardTitle>
            <p className="text-xs font-normal text-slate-500">Global catalog intake across all postings</p>
          </CardHeader>
          <CardContent>
            {statsPending ? <ChartSkeleton height="h-40" /> : isError ? (
              <p className="text-sm text-red-500">Failed to load</p>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <LineChart
                  data={data!.catalog.weeklyJobCounts.map((d) => ({
                    ...d,
                    label: new Date(d.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                  }))}
                  margin={{ left: 8, right: 16 }}
                >
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="jobCount" stroke="#6366f1" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Remote vs On-site</CardTitle>
            <p className="text-xs font-normal text-slate-500">Global catalog split across all postings</p>
          </CardHeader>
          <CardContent>
            {statsPending ? <ChartSkeleton height="h-40" /> : isError ? (
              <p className="text-sm text-red-500">Failed to load</p>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Remote', value: data!.catalog.remoteCount },
                      { name: 'On-site', value: data!.catalog.onsiteCount },
                    ]}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    outerRadius={60}
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    <Cell fill="#22c55e" />
                    <Cell fill="#94a3b8" />
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Recent Activity</CardTitle></CardHeader>
        <CardContent>
          {activityPending ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : activityError ? (
            <p className="text-sm text-red-500 py-4 text-center">
              Failed to load activity.
            </p>
          ) : !activityData || activityData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No stage changes recorded yet.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {activityData.map((item) => (
                <li key={item.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{item.jobTitle}</span>
                    {item.companyName && (
                      <span className="text-slate-500"> at <span className="font-medium">{item.companyName}</span></span>
                    )}
                    <span className="text-slate-500"> moved from </span>
                    {item.fromStage ? <StageBadge stage={item.fromStage} /> : <span className="text-slate-600 text-xs">—</span>}
                    <span className="text-slate-500 mx-1">→</span>
                    <StageBadge stage={item.toStage} />
                  </div>
                  <span className="text-xs text-slate-600 whitespace-nowrap flex-shrink-0">
                    {relativeTime(item.changedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
