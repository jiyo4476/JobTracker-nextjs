import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/layout/PageHeader'

const kpiCards = [
  'Total Jobs',
  'Applied',
  'Active Interviews',
  'Stale Listings',
]

export default function DashboardPage() {
  return (
    <div className="p-8">
      <PageHeader title="Dashboard" description="Your job search at a glance" />
      <div className="grid grid-cols-4 gap-4 mb-8">
        {kpiCards.map((label) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <Skeleton className="h-9 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader><CardTitle className="text-sm">Top 15 Skills</CardTitle></CardHeader>
          <CardContent><Skeleton className="h-56 w-full" /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Application Funnel</CardTitle></CardHeader>
          <CardContent><Skeleton className="h-56 w-full" /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Jobs Found per Week</CardTitle></CardHeader>
          <CardContent><Skeleton className="h-40 w-full" /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Remote vs On-site</CardTitle></CardHeader>
          <CardContent><Skeleton className="h-40 w-full" /></CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-sm">Recent Activity</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-20 flex-shrink-0" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
