'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/PageHeader'
import { ResumeVersionsSettings } from './ResumeVersionsSettings'
import { TaxonomyProfileAndGapSettings } from './TaxonomyProfileSettings'

async function handleExport(format: 'json' | 'csv', setLoading: (v: boolean) => void) {
  setLoading(true)
  try {
    const res = await fetch('/api/export?format=' + format)
    if (!res.ok) {
      toast.error('Export failed')
      return
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'jobs.' + format
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    toast.error('Export failed')
  } finally {
    setLoading(false)
  }
}

export default function SettingsPage() {
  const [jsonLoading, setJsonLoading] = useState(false)
  const [csvLoading, setCsvLoading] = useState(false)

  return (
    <div className="max-w-6xl space-y-8 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Settings" description="Configure your job search tracker" />

      <ResumeVersionsSettings />

      <TaxonomyProfileAndGapSettings />

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
            <code className="block bg-slate-100 px-3 py-2 rounded text-xs font-mono text-slate-700">{'Authorization: Bearer <OAuth2 access token>'}</code>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
