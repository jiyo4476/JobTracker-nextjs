'use client'

import { useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  useAnalytics,
  type SkillDemandRow,
  type SalaryDistributionRow,
} from '@/lib/queries'

const SKILL_COLORS = [
  '#6366f1', '#f59e0b', '#22c55e', '#ef4444', '#06b6d4',
  '#8b5cf6', '#f97316', '#14b8a6', '#ec4899', '#84cc16',
]

const PLATFORMS = ['', 'linkedin', 'indeed', 'glassdoor', 'dice', 'lever', 'greenhouse', 'workday', 'angellist', 'direct', 'other']
const CLEARANCE_MODES = [
  { label: 'All', value: null },
  { label: 'Clearance', value: true },
  { label: 'No clearance', value: false },
] as const

function EmptyState() {
  return (
    <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">
      No data yet
    </div>
  )
}

function SkillDemandChart({ data }: { data: SkillDemandRow[] }) {
  if (!data.length) return <EmptyState />
  const skills = [...new Set(data.map((r) => r.skill))]
  const months = [...new Set(data.map((r) => r.month))].sort()
  const byMonth = months.map((month) => {
    const row: Record<string, string | number> = { month }
    skills.forEach((skill) => {
      row[skill] = data.find((r) => r.month === month && r.skill === skill)?.count ?? 0
    })
    return row
  })
  return (
    <ResponsiveContainer width="100%" height={208}>
      <LineChart data={byMonth}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend />
        {skills.map((skill, i) => (
          <Line
            key={skill}
            type="monotone"
            dataKey={skill}
            stroke={SKILL_COLORS[i % SKILL_COLORS.length]}
            dot={false}
            strokeWidth={2}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

function SalaryChart({ data }: { data: SalaryDistributionRow[] }) {
  if (!data.length) return <EmptyState />
  const jobTypes = [...new Set(data.map((r) => r.job_type))]
  const levels = [...new Set(data.map((r) => r.experience_level))]
  const byLevel = levels.map((level) => {
    const row: Record<string, string | number> = { level }
    jobTypes.forEach((jt) => {
      const found = data.find((r) => r.experience_level === level && r.job_type === jt)
      row[jt] = found ? Math.round(found.avg_min / 100000) : 0
    })
    return row
  })
  return (
    <ResponsiveContainer width="100%" height={208}>
      <BarChart data={byLevel}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="level" tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={(v) => `$${v}k`} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v: unknown) => typeof v === 'number' ? `$${v}k` : String(v)} />
        <Legend />
        {jobTypes.map((jt, i) => (
          <Bar key={jt} dataKey={jt} fill={SKILL_COLORS[i % SKILL_COLORS.length]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

function PlatformChart({ data }: { data: { platform: string; count: number }[] }) {
  if (!data.length) return <EmptyState />
  return (
    <ResponsiveContainer width="100%" height={208}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="platform"
          cx="50%"
          cy="50%"
          outerRadius={80}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          label={((entry: any) => `${entry.platform} (${entry.count})`) as any}
          labelLine={false}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={SKILL_COLORS[i % SKILL_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  )
}

function RemoteChart({ data }: { data: { week: string; remote: number; onsite: number }[] }) {
  if (!data.length) return <EmptyState />
  return (
    <ResponsiveContainer width="100%" height={208}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="week" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend />
        <Area type="monotone" dataKey="remote" stackId="1" stroke="#22c55e" fill="#22c55e" fillOpacity={0.4} />
        <Area type="monotone" dataKey="onsite" stackId="1" stroke="#64748b" fill="#64748b" fillOpacity={0.4} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export default function AnalyticsPage() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [platform, setPlatform] = useState('')
  const [skillClearance, setSkillClearance] = useState<boolean | null>(null)

  const params = {
    from: from || undefined,
    to: to || undefined,
    platform: platform || undefined,
    security_clearance: skillClearance ?? undefined,
  }

  const { data, isLoading } = useAnalytics(params)

  return (
    <div className="p-8">
      <PageHeader title="Analytics" description="Trends across your full job dataset" />

      <div className="flex gap-4 mb-6 items-end flex-wrap">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">From</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">To</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Platform</label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm w-40"
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>{p || 'All platforms'}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Top skills clearance</span>
          <div className="inline-flex rounded-md border border-input bg-background p-1">
            {CLEARANCE_MODES.map((mode) => (
              <button
                key={mode.label}
                type="button"
                aria-pressed={skillClearance === mode.value}
                onClick={() => setSkillClearance(mode.value)}
                className={`h-7 rounded px-3 text-xs font-medium transition-colors ${
                  skillClearance === mode.value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card className="col-span-2">
          <CardHeader><CardTitle className="text-sm">Top 15 Skill Demand Over Time</CardTitle></CardHeader>
          <CardContent>
            {isLoading
              ? <Skeleton className="h-52 w-full" />
              : <SkillDemandChart data={data?.skillDemandOverTime ?? []} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Salary Distribution</CardTitle></CardHeader>
          <CardContent>
            {isLoading
              ? <Skeleton className="h-52 w-full" />
              : <SalaryChart data={data?.salaryDistribution ?? []} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Platform Breakdown</CardTitle></CardHeader>
          <CardContent>
            {isLoading
              ? <Skeleton className="h-52 w-full" />
              : <PlatformChart data={data?.platformBreakdown ?? []} />}
          </CardContent>
        </Card>

        <Card className="col-span-2">
          <CardHeader><CardTitle className="text-sm">Remote vs On-site by Week</CardTitle></CardHeader>
          <CardContent>
            {isLoading
              ? <Skeleton className="h-52 w-full" />
              : <RemoteChart data={data?.remoteVsOnsiteByWeek ?? []} />}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
