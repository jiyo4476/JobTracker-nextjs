import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'

export default function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="p-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <Skeleton className="h-7 w-48 mb-2" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Button variant="outline" size="sm">Edit</Button>
      </div>
      <div className="grid grid-cols-3 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm">Company Info</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {['Industry', 'Size', 'HQ', 'Website', 'LinkedIn', 'Glassdoor'].map(l => (
              <div key={l} className="flex justify-between">
                <span className="text-slate-500">{l}</span>
                <Skeleton className="h-4 w-28" />
              </div>
            ))}
          </CardContent>
        </Card>
        <div className="col-span-2">
          <Card>
            <CardHeader><CardTitle className="text-sm">Jobs at this Company</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-2 border border-slate-100 rounded-md">
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
