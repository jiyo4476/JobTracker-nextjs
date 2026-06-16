import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: _id } = await params // eslint-disable-line @typescript-eslint/no-unused-vars
  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <Skeleton className="h-7 w-72 mb-2" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">Mark Applied</Button>
          <Button size="sm">Update Stage</Button>
          <Button variant="outline" size="sm">Open Posting</Button>
        </div>
      </div>
      <div className="grid grid-cols-5 gap-6">
        <div className="col-span-3 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Job Description</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {Array.from({ length: 14 }).map((_, i) => (
                <Skeleton key={i} className={`h-4 ${i % 6 === 5 ? 'w-2/3' : 'w-full'}`} />
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Skills & Tags</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-20 rounded-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="col-span-2 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Details</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {['Company', 'Location', 'Salary', 'Type', 'Experience', 'Platform', 'Priority', 'Status', 'Date Posted'].map(label => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-slate-500">{label}</span>
                  <Skeleton className="h-4 w-28" />
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Notes</CardTitle></CardHeader>
            <CardContent>
              <Skeleton className="h-28 w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Contacts</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
              <Button variant="outline" size="sm" className="w-full mt-2">+ Add Contact</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
