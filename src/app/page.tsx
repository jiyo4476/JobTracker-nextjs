'use client'

import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/layout/PageHeader'
import { useStats } from '@/lib/queries'

const KPI_LABELS = ['Total Jobs', 'Applied', 'Active Interviews', 'Stale Listings'] as const

function KpiSkeleton() {
  return <Skeleton className="h-9 w-16" />
}

function ChartSkeleton({ height }: { height: string }) {
  return <Skeleton className={`${height} w-full`} />
}

export default function DashboardPage() {
  const { data, isLoading, isError } = useStats()

  const kpiValues = data
    ? [data.totalJobs, data.applied, data.activeInterviews, data.staleListings]
    : null

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
              {isLoading ? (
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

      <div className="grid grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader><CardTitle className="text-sm">Top 15 Skills</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <ChartSkeleton height="h-56" /> : isError ? (
              <p className="text-sm text-red-500">Failed to load</p>
            ) : (
              <ResponsiveContainer width="100%" height={224}>
                <BarChart data={data!.topSkills} layout="vertical" margin={{ left: 8, right: 16 }}>
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
          <CardHeader><CardTitle className="text-sm">Application Funnel</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <ChartSkeleton height="h-56" /> : isError ? (
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
          <CardHeader><CardTitle className="text-sm">Jobs Found per Week</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <ChartSkeleton height="h-40" /> : isError ? (
              <p className="text-sm text-red-500">Failed to load</p>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <LineChart
                  data={data!.weeklyJobCounts.map((d) => ({
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
          <CardHeader><CardTitle className="text-sm">Remote vs On-site</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <ChartSkeleton height="h-40" /> : isError ? (
              <p className="text-sm text-red-500">Failed to load</p>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Remote', value: data!.remoteCount },
                      { name: 'On-site', value: data!.onsiteCount },
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
    </div>
  )
}
