'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  interviewStageBadgeStyles,
  interviewStageBadgeLabels,
  type InterviewStage,
} from '@/lib/enums'

export function StageBadge({ stage }: { stage: string }) {
  const key = stage as InterviewStage
  return (
    <Badge
      variant="secondary"
      className={cn(
        'text-xs font-medium',
        interviewStageBadgeStyles[key] ?? 'bg-slate-100 text-slate-700',
      )}
    >
      {interviewStageBadgeLabels[key] ?? stage}
    </Badge>
  )
}
