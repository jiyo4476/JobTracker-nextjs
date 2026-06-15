import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/layout/PageHeader'

export default function SettingsPage() {
  return (
    <div className="p-8 max-w-4xl space-y-8">
      <PageHeader title="Settings" description="Configure your job search tracker" />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Resume Versions</CardTitle>
            <Button size="sm">+ Add Version</Button>
          </div>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500 text-xs uppercase tracking-wide">
                {['Label', 'Date', 'Notes', ''].map((h, i) => <th key={i} className="pb-2 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}>
                  <td className="py-3"><Skeleton className="h-4 w-32" /></td>
                  <td className="py-3"><Skeleton className="h-4 w-24" /></td>
                  <td className="py-3"><Skeleton className="h-4 w-48" /></td>
                  <td className="py-3 text-right"><Skeleton className="h-7 w-14 ml-auto" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Skill Gap Tracker</CardTitle>
          <p className="text-sm text-slate-500">Toggle the skills you have. Match % is computed per job.</p>
        </CardHeader>
        <CardContent>
          <Input placeholder="Search skills…" className="max-w-xs mb-4" />
          <div className="space-y-1">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between py-2 px-1 hover:bg-slate-50 rounded">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-4 w-36" />
                </div>
                <Skeleton className="h-4 w-20 text-right" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Scraper Webhook</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="text-slate-500 mb-1">Endpoint</p>
            <code className="block bg-slate-100 px-3 py-2 rounded text-xs font-mono text-slate-700">POST /api/scrape</code>
          </div>
          <div>
            <p className="text-slate-500 mb-1">Authorization header</p>
            <code className="block bg-slate-100 px-3 py-2 rounded text-xs font-mono text-slate-700">{'Authorization: Bearer <API_KEY>'}</code>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Export Data</CardTitle></CardHeader>
        <CardContent className="flex gap-3">
          <Button variant="outline">Export as JSON</Button>
          <Button variant="outline">Export as CSV</Button>
        </CardContent>
      </Card>
    </div>
  )
}
