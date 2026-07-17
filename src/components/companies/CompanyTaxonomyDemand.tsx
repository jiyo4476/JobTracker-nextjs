import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { taxonomyFilterParams, type TaxonomyCategory } from '@/lib/taxonomy'
import type { CompanyTaxonomyDemand as CompanyTaxonomyDemandData } from '@/types/queries'

const groups: ReadonlyArray<{ category: TaxonomyCategory; label: string }> = [
  { category: 'skills', label: 'Skills' },
  { category: 'software', label: 'Software' },
  { category: 'certifications', label: 'Certifications' },
  { category: 'keywords', label: 'Keywords' },
]

function jobsLabel(count: number) {
  return `${count} active ${count === 1 ? 'job' : 'jobs'}`
}

export function CompanyTaxonomyDemand({ demand }: { demand: CompanyTaxonomyDemandData }) {
  const hasDemand = groups.some(({ category }) => demand[category].length > 0)

  return (
    <Card aria-labelledby="company-demand-heading">
      <CardHeader>
        <CardTitle id="company-demand-heading" className="text-sm">
          Job qualifications &amp; keywords
        </CardTitle>
        <p className="text-sm text-slate-600">
          {demand.activeJobCount === 0
            ? 'No active jobs are available to summarize.'
            : demand.activeJobCount < 3
              ? `Limited sample: based on ${jobsLabel(demand.activeJobCount)}.`
              : `Based on ${jobsLabel(demand.activeJobCount)}.`}
        </p>
      </CardHeader>
      <CardContent>
        {!hasDemand && demand.activeJobCount > 0 && (
          <p className="mb-4 text-sm text-slate-500">
            No Skills, Software, Certifications, or Keywords are linked to these active jobs yet.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2" aria-label="Company job demand by category">
          {groups.map(({ category, label }) => {
            const items = demand[category]
            return (
              <section key={category} aria-labelledby={`company-demand-${category}`} className="rounded-md border border-slate-200 p-4">
                <h3 id={`company-demand-${category}`} className="text-sm font-semibold text-slate-900">
                  {label}
                </h3>
                {items.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">No {label.toLowerCase()} found.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {items.map(item => (
                      <li key={item.id}>
                        <Link
                          href={`/jobs?${taxonomyFilterParams[category]}=${item.id}`}
                          className="flex min-h-8 items-center justify-between gap-3 rounded px-2 py-1 text-sm text-blue-700 hover:bg-blue-50 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                          aria-label={`${item.name}: ${jobsLabel(item.jobCount)}. View matching jobs filtered by ${label.toLowerCase()}.`}
                        >
                          <span>{item.name}</span>
                          <span className="shrink-0 text-xs font-medium text-slate-600">{item.jobCount}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
