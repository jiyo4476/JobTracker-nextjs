'use client'

import { useId, useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'
import { Download, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  useAnalytics,
  useTaxonomyAnalytics,
  type SkillDemandRow,
  type SalaryDistributionRow,
  type TaxonomyAnalyticsRow,
  type TaxonomyCategory,
} from '@/lib/queries'
import { sourcePlatformOptions } from '@/lib/source-platforms'
import {
  analyticsUrl,
  TAXONOMY_CATEGORIES,
  taxonomyCsv,
  type AnalyticsUrlState,
} from './analytics-state'

const COLORS = ['#6366f1', '#f59e0b', '#22c55e', '#ef4444', '#06b6d4', '#8b5cf6']

function EmptyState({ label }: { label: string }) {
  return <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">No {label.toLowerCase()} data matches these filters.</div>
}

function ErrorState({ label, retry }: { label: string; retry: () => void }) {
  return (
    <div role="alert" className="flex h-52 flex-col items-center justify-center gap-3 text-sm text-destructive">
      {label} could not be loaded.
      <Button type="button" variant="outline" size="sm" onClick={retry}><RefreshCw aria-hidden /> Try again</Button>
    </div>
  )
}

function SkillDemandChart({ data }: { data: SkillDemandRow[] }) {
  if (!data.length) return <EmptyState label="skill trend" />
  const skills = [...new Set(data.map(row => row.skill))]
  const byMonth = [...new Set(data.map(row => row.month))].sort().map(month => Object.fromEntries([
    ['month', month],
    ...skills.map(skill => [skill, data.find(row => row.month === month && row.skill === skill)?.count ?? 0]),
  ]))
  return <ResponsiveContainer width="100%" height={208}><LineChart data={byMonth}><CartesianGrid strokeDasharray="3 3" className="stroke-border" /><XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Legend />{skills.map((skill, index) => <Line key={skill} type="monotone" dataKey={skill} stroke={COLORS[index % COLORS.length]} dot={false} strokeWidth={2} />)}</LineChart></ResponsiveContainer>
}

function SalaryChart({ data }: { data: SalaryDistributionRow[] }) {
  if (!data.length) return <EmptyState label="salary" />
  const jobTypes = [...new Set(data.map(row => row.job_type))]
  const byLevel = [...new Set(data.map(row => row.experience_level))].map(level => Object.fromEntries([
    ['level', level],
    ...jobTypes.map(jobType => [jobType, Math.round((data.find(row => row.experience_level === level && row.job_type === jobType)?.avg_min ?? 0) / 100000)]),
  ]))
  return <ResponsiveContainer width="100%" height={208}><BarChart data={byLevel}><CartesianGrid strokeDasharray="3 3" className="stroke-border" /><XAxis dataKey="level" tick={{ fontSize: 11 }} /><YAxis tickFormatter={value => `$${value}k`} tick={{ fontSize: 11 }} /><Tooltip formatter={value => typeof value === 'number' ? `$${value}k` : String(value)} /><Legend />{jobTypes.map((jobType, index) => <Bar key={jobType} dataKey={jobType} fill={COLORS[index % COLORS.length]} />)}</BarChart></ResponsiveContainer>
}

function PlatformChart({ data }: { data: { platform: string; count: number }[] }) {
  if (!data.length) return <EmptyState label="platform" />
  return <ResponsiveContainer width="100%" height={208}><PieChart><Pie data={data} dataKey="count" nameKey="platform" cx="50%" cy="50%" outerRadius={80}>{data.map((row, index) => <Cell key={row.platform} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer>
}

function RemoteChart({ data }: { data: { week: string; remote: number; onsite: number }[] }) {
  if (!data.length) return <EmptyState label="remote trend" />
  return <ResponsiveContainer width="100%" height={208}><AreaChart data={data}><CartesianGrid strokeDasharray="3 3" className="stroke-border" /><XAxis dataKey="week" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Legend /><Area type="monotone" dataKey="remote" stackId="1" stroke="#22c55e" fill="#22c55e" fillOpacity={0.4} /><Area type="monotone" dataKey="onsite" stackId="1" stroke="#64748b" fill="#64748b" fillOpacity={0.4} /></AreaChart></ResponsiveContainer>
}

function TaxonomyChart({ rows, categoryLabel }: { rows: TaxonomyAnalyticsRow[]; categoryLabel: string }) {
  if (!rows.length) return <EmptyState label={categoryLabel} />
  return (
    <>
      <ResponsiveContainer width="100%" height={Math.max(240, rows.length * 34)}>
        <BarChart data={rows} layout="vertical" margin={{ left: 12, right: 28 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(value, name, item) => name === 'count' ? [`${value} jobs (${item.payload.percentage}%)`, categoryLabel] : String(value)} />
          <Legend formatter={() => `${categoryLabel} job count`} />
          <Bar dataKey="count" name={categoryLabel} fill="#6366f1" />
        </BarChart>
      </ResponsiveContainer>
      <table className="sr-only"><caption>{categoryLabel} demand summary</caption><thead><tr><th>{categoryLabel}</th><th>Job count</th><th>Percentage</th></tr></thead><tbody>{rows.map(row => <tr key={row.name}><th>{row.name}</th><td>{row.count}</td><td>{row.percentage}%</td></tr>)}</tbody></table>
    </>
  )
}

export function AnalyticsClient({ initialState }: { initialState: AnalyticsUrlState }) {
  const [state, setState] = useState(initialState)
  const category = TAXONOMY_CATEGORIES.find(option => option.value === state.category) ?? TAXONOMY_CATEGORIES[0]
  const globalParams = { from: state.from || undefined, to: state.to || undefined, platform: state.platform || undefined, security_clearance: state.clearance ? state.clearance === 'true' : undefined }
  const analytics = useAnalytics(globalParams)
  const taxonomy = useTaxonomyAnalytics({ category: state.category, limit: 15, ...globalParams })
  const clearanceLabelId = useId()

  function update(patch: Partial<AnalyticsUrlState>) {
    const next = { ...state, ...patch }
    setState(next)
    window.history.pushState(null, '', analyticsUrl(next))
  }

  function exportRows() {
    if (!taxonomy.data?.values?.length) return
    const blob = new Blob([taxonomyCsv(category.label, taxonomy.data.values, taxonomy.data.percentage_denominator)], { type: 'text/csv;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `analytics-${state.category}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  function moveCategoryFocus(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    const current = tabs.indexOf(document.activeElement as HTMLButtonElement)
    if (current < 0) return
    event.preventDefault()
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? tabs.length - 1
        : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    tabs[next].focus()
    tabs[next].click()
  }

  return (
    <div className="p-4 sm:p-8">
      <PageHeader title="Analytics" description="Category-safe trends across your job dataset" />
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">From<Input aria-label="From date" type="date" value={state.from} onChange={event => update({ from: event.target.value })} className="w-40" /></label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">To<Input aria-label="To date" type="date" value={state.to} onChange={event => update({ to: event.target.value })} className="w-40" /></label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Platform<select aria-label="Platform" value={state.platform} onChange={event => update({ platform: event.target.value })} className="h-9 w-40 rounded-md border border-input bg-background px-3 text-sm"><option value="">All platforms</option>{sourcePlatformOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground" id={clearanceLabelId}>Clearance<select aria-labelledby={clearanceLabelId} value={state.clearance} onChange={event => update({ clearance: event.target.value as AnalyticsUrlState['clearance'] })} className="h-9 w-40 rounded-md border border-input bg-background px-3 text-sm"><option value="">All jobs</option><option value="true">Clearance required</option><option value="false">No clearance required</option></select></label>
      </div>

      <section aria-labelledby="taxonomy-report-title" className="mb-6">
        <div role="tablist" aria-label="Taxonomy report category" onKeyDown={moveCategoryFocus} className="mb-4 flex flex-wrap gap-2">{TAXONOMY_CATEGORIES.map(option => <Button key={option.value} id={`taxonomy-tab-${option.value}`} type="button" role="tab" aria-controls="taxonomy-report-panel" aria-selected={state.category === option.value} tabIndex={state.category === option.value ? 0 : -1} variant={state.category === option.value ? 'default' : 'outline'} onClick={() => update({ category: option.value as TaxonomyCategory })}>{option.label}</Button>)}</div>
        <Card id="taxonomy-report-panel" role="tabpanel" aria-labelledby={`taxonomy-tab-${state.category}`}>
          <CardHeader className="flex-row items-center justify-between gap-3"><div><CardTitle id="taxonomy-report-title" className="text-sm">Top 15 {category.label} Demand</CardTitle><p className="mt-1 text-xs text-muted-foreground">Percentages use {taxonomy.data?.percentage_denominator ?? 'this category’s filtered job-to-value assignments'}; categories are never combined.</p></div><Button type="button" variant="outline" size="sm" disabled={!taxonomy.data?.values?.length} onClick={exportRows}><Download aria-hidden /> Export {category.label} CSV</Button></CardHeader>
          <CardContent>{taxonomy.isLoading ? <Skeleton aria-label={`Loading ${category.label} report`} className="h-60 w-full" /> : taxonomy.isError ? <ErrorState label={`${category.label} report`} retry={() => void taxonomy.refetch()} /> : <TaxonomyChart rows={taxonomy.data?.values ?? []} categoryLabel={category.label} />}</CardContent>
        </Card>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2"><CardHeader><CardTitle className="text-sm">Top 15 Skill Demand Over Time</CardTitle></CardHeader><CardContent>{analytics.isLoading ? <Skeleton className="h-52 w-full" /> : analytics.isError ? <ErrorState label="Analytics" retry={() => void analytics.refetch()} /> : <SkillDemandChart data={analytics.data?.skillDemandOverTime ?? []} />}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Salary Distribution</CardTitle></CardHeader><CardContent>{analytics.isLoading ? <Skeleton className="h-52 w-full" /> : <SalaryChart data={analytics.data?.salaryDistribution ?? []} />}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Platform Breakdown</CardTitle></CardHeader><CardContent>{analytics.isLoading ? <Skeleton className="h-52 w-full" /> : <PlatformChart data={analytics.data?.platformBreakdown ?? []} />}</CardContent></Card>
        <Card className="lg:col-span-2"><CardHeader><CardTitle className="text-sm">Remote vs On-site by Week</CardTitle></CardHeader><CardContent>{analytics.isLoading ? <Skeleton className="h-52 w-full" /> : <RemoteChart data={analytics.data?.remoteVsOnsiteByWeek ?? []} />}</CardContent></Card>
      </div>
    </div>
  )
}
