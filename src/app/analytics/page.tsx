import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/layout/PageHeader'

const charts: { title: string; span?: string }[] = [
  { title: 'Skill Demand Over Time', span: 'col-span-2' },
  { title: 'Salary Distribution' },
  { title: 'Application Response Rate' },
  { title: 'Platform Breakdown' },
  { title: 'Remote vs On-site Trend' },
  { title: 'Clearance Salary Premium' },
  { title: 'Top Certifications' },
]

export default function AnalyticsPage() {
  return (
    <div className="p-8">
      <PageHeader title="Analytics" description="Trends across your full job dataset" />
      <div className="grid grid-cols-2 gap-6">
        {charts.map(({ title, span }) => (
          <Card key={title} className={span}>
            <CardHeader><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
            <CardContent><Skeleton className="h-52 w-full" /></CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
