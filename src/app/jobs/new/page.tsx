import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/layout/PageHeader'

export default function NewJobPage() {
  return (
    <div className="p-8 max-w-3xl">
      <PageHeader title="Add Job" description="Manually add a job listing to track" />
      <Card>
        <CardContent className="pt-6 space-y-5">
        <form action="/api/jobs" method="post">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="company" className="block text-sm font-medium text-slate-700 mb-1.5">Company *</label>
              <Input id="company" name="company" placeholder="e.g. Acme Corp" />
            </div>
            <div>
              <label htmlFor="jobTitle" className="block text-sm font-medium text-slate-700 mb-1.5">Job Title *</label>
              <Input id="jobTitle" name="jobTitle" placeholder="e.g. Senior Software Engineer" />
            </div>
          </div>
          <div>
            <label htmlFor="jobLink" className="block text-sm font-medium text-slate-700 mb-1.5">Job Link *</label>
            <Input id="jobLink" name="jobLink" type="url" placeholder="https://..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="location" className="block text-sm font-medium text-slate-700 mb-1.5">Location</label>
              <Input id="location" name="location" placeholder="e.g. Austin, TX or Remote" />
            </div>
            <div>
              <label htmlFor="salaryRange" className="block text-sm font-medium text-slate-700 mb-1.5">Salary Range</label>
              <Input id="salaryRange" name="salaryRange" placeholder="e.g. $120k–$160k/yr" />
            </div>
          </div>
          <div>
            <label htmlFor="jobDescription" className="block text-sm font-medium text-slate-700 mb-1.5">Job Description</label>
            <Textarea id="jobDescription" name="jobDescription" placeholder="Paste the full job description here…" className="min-h-[180px]" />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="submit">Save Job</Button>
            <Link href="/jobs" className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 h-9 text-sm font-medium text-slate-900 hover:bg-slate-50 transition-colors">
              Cancel
            </Link>
          </div>
        </form>
        </CardContent>
      </Card>
    </div>
  )
}
