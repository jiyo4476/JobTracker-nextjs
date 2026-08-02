'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  interviewStageBadgeStyles,
  interviewStageBadgeLabels,
  type InterviewStage,
} from '@/lib/enums'

export function isInterviewStage(value: string): value is InterviewStage {
  return value in interviewStageBadgeStyles
}

export function StageBadge({ stage }: { stage: InterviewStage | string }) {
  const known = isInterviewStage(stage)
  return (
    <Badge
      variant="secondary"
      className={cn(
        'text-xs font-medium',
        known ? interviewStageBadgeStyles[stage] : 'bg-slate-100 text-slate-700',
      )}
    >
      {known ? interviewStageBadgeLabels[stage] : stage}
    </Badge>
  )
}
