'use client'

import { JobTaxonomyCard } from '@/components/jobs/JobTaxonomyCard'
import type { JobDetail } from '@/lib/queries'

export function JobTagsEditor({ jobId, job }: { jobId: string; job: JobDetail }) {
  return <JobTaxonomyCard jobId={jobId} job={job} />
}
