'use client'

import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/layout/PageHeader'
import { useCompanies } from '@/lib/queries'

function formatSalary(cents: number | null) {
  return cents ? '$' + Math.round(cents / 100000) + 'k' : '—'
}

export default function CompaniesPage() {
  const { data: companies, isLoading } = useCompanies()

  return (
    <div className="p-8">
      <PageHeader title="Companies" description="All tracked companies with job counts" />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500 text-xs uppercase tracking-wide">
                {['Company', 'Industry', 'HQ', 'Jobs Found', 'Avg Salary Max', 'Website'].map(h => (
                  <th key={h} className="px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading
                ? Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-10" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-6" /></td>
                    </tr>
                  ))
                : companies?.map(row => (
                    <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/companies/${row.id}`} className="text-blue-600 hover:underline font-medium">
                          {row.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.industry ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{row.hqLocation ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{row.jobCount}</td>
                      <td className="px-4 py-3 text-slate-600">{formatSalary(row.avgSalaryMax)}</td>
                      <td className="px-4 py-3">
                        {row.website
                          ? <a href={row.website} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-blue-600">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          : '—'}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
