import { Suspense } from 'react'
import JobsClient from './JobsClient'

export default function JobsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-600">Loading...</div>}>
      <JobsClient />
    </Suspense>
  )
}
