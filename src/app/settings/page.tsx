'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/PageHeader'
import { useSkills } from '@/lib/queries'
import { ResumeVersionsSettings } from './ResumeVersionsSettings'

async function handleExport(format: 'json' | 'csv', setLoading: (v: boolean) => void) {
  setLoading(true)
  try {
    const res = await fetch('/api/export?format=' + format, {
      headers: { Authorization: 'Bearer ' + (process.env.NEXT_PUBLIC_API_KEY ?? '') },
    })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'jobs.' + format
    a.click()
    URL.revokeObjectURL(url)
  } finally {
    setLoading(false)
  }
}

export default function SettingsPage() {
  const { data: skills = [], isLoading: skillsLoading } = useSkills()
  const [jsonLoading, setJsonLoading] = useState(false)
  const [csvLoading, setCsvLoading] = useState(false)

  return (
    <div className="p-8 max-w-4xl space-y-8">
      <PageHeader title="Settings" description="Configure your job search tracker" />

      <ResumeVersionsSettings />

      <Card>
        <CardHeader>
          <CardTitle>Skill Gap Analysis</CardTitle>
          <p className="text-sm text-slate-500">
            Skills seen across all job listings. Checkbox tracking coming soon.
          </p>
        </CardHeader>
        <CardContent>
          {skillsLoading ? (
            <p className="text-sm text-slate-400">Loading skills…</p>
          ) : (
            <div className="space-y-1">
              {skills.map((skill) => (
                <div
                  key={skill.id}
                  className="flex items-center justify-between py-2 px-1 hover:bg-slate-50 rounded"
                >
                  <div className="flex items-center gap-3">
                    <input type="checkbox" disabled className="h-4 w-4 rounded opacity-40 cursor-not-allowed" />
                    <span className="text-sm">{skill.name}</span>
                  </div>
                  <span className="text-xs text-slate-400">{skill.jobCount ?? 0} jobs</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Export Data</CardTitle></CardHeader>
        <CardContent className="flex gap-3">
          <Button
            variant="outline"
            disabled={jsonLoading}
            onClick={() => handleExport('json', setJsonLoading)}
          >
            {jsonLoading ? 'Exporting…' : 'Export as JSON'}
          </Button>
          <Button
            variant="outline"
            disabled={csvLoading}
            onClick={() => handleExport('csv', setCsvLoading)}
          >
            {csvLoading ? 'Exporting…' : 'Export as CSV'}
          </Button>
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
    </div>
  )
}
