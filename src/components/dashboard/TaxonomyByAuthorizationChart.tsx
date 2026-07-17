'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useTaxonomyClearanceComparison } from '@/lib/queries'
import type { TaxonomyAnalyticsRow, TaxonomyCategory } from '@/types/queries'

const categories: Array<{ value: TaxonomyCategory; label: string }> = [
  { value: 'skills', label: 'Skills' },
  { value: 'software', label: 'Software' },
  { value: 'certifications', label: 'Certifications' },
  { value: 'keywords', label: 'Keywords' },
]

function isTaxonomyCategory(value: string | null): value is TaxonomyCategory {
  return categories.some((category) => category.value === value)
}

function truncatedName(value: string) {
  return value.length > 22 ? `${value.slice(0, 19)}…` : value
}

function ComparisonChart({
  title,
  data,
  color,
}: {
  title: string
  data: TaxonomyAnalyticsRow[]
  color: string
}) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="flex h-72 items-center justify-center text-sm text-muted-foreground">No data available.</p>
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={data} layout="vertical" margin={{ left: 12, right: 28 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                tick={{ fontSize: 11 }}
                tickFormatter={truncatedName}
              />
              <Tooltip
                formatter={(value, _name, item) => [
                  `${Number(value).toLocaleString()} (${item.payload.percentage.toFixed(1)}%)`,
                  'Jobs',
                ]}
                labelFormatter={(label) => String(label)}
              />
              <Bar dataKey="count" fill={color} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

function ComparisonSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-2" aria-label="Loading taxonomy comparison charts">
      {[0, 1].map((index) => (
        <Card key={index}>
          <CardHeader><Skeleton className="h-5 w-56" /></CardHeader>
          <CardContent><Skeleton className="h-[360px] w-full" /></CardContent>
        </Card>
      ))}
    </div>
  )
}

export function TaxonomyByAuthorizationChart() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [category, setCategory] = useState<TaxonomyCategory>(() => {
    const urlCategory = searchParams.get('taxonomy')
    return isTaxonomyCategory(urlCategory) ? urlCategory : 'skills'
  })
  const { data, isLoading, isError, refetch } = useTaxonomyClearanceComparison(category)
  const categoryLabel = categories.find((item) => item.value === category)!.label

  function selectCategory(nextCategory: TaxonomyCategory) {
    setCategory(nextCategory)
    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.set('taxonomy', nextCategory)
    router.replace(`/?${nextParams.toString()}`, { scroll: false })
  }

  const insightNames = (data?.clearance_required ?? []).slice(0, 3).map((item) => item.name)

  return (
    <section className="mb-8" aria-labelledby="taxonomy-comparison-title">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="taxonomy-comparison-title" className="text-lg font-semibold">Qualifications &amp; Keywords Dashboard</h2>
          <p className="text-sm text-muted-foreground">Compare demand across active jobs by clearance requirement.</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-md bg-slate-100 p-1" role="group" aria-label="Taxonomy category">
          {categories.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={category === item.value}
              onClick={() => selectCategory(item.value)}
              className={`rounded px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                category === item.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? <ComparisonSkeleton /> : isError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-red-600">Failed to load the {categoryLabel.toLowerCase()} comparison.</p>
            <button type="button" className="rounded-md border px-3 py-1.5 text-sm font-medium" onClick={() => refetch()}>
              Retry
            </button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <ComparisonChart
              title={`Top 15 ${categoryLabel} — Clearance Required`}
              data={data?.clearance_required ?? []}
              color="#0f766e"
            />
            <ComparisonChart
              title={`Top 15 ${categoryLabel} — No Clearance`}
              data={data?.clearance_not_required ?? []}
              color="#ea580c"
            />
          </div>
          {insightNames.length > 0 && (
            <p className="mt-3 text-sm text-slate-600">
              Clearance roles tend to emphasize these {categoryLabel.toLowerCase()}: {insightNames.join(', ')}.
            </p>
          )}
        </>
      )}
    </section>
  )
}
