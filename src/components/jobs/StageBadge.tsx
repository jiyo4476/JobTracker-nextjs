'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const stageStyles: Record<string, string> = {
  not_applied: 'bg-slate-100 text-slate-700 hover:bg-slate-100',
  applied: 'bg-blue-100 text-blue-700 hover:bg-blue-100',
  phone_screen: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-100',
  technical_screen: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-100',
  onsite: 'bg-orange-100 text-orange-700 hover:bg-orange-100',
  offer_received: 'bg-green-100 text-green-700 hover:bg-green-100',
  rejected: 'bg-red-100 text-red-700 hover:bg-red-100',
  withdrawn: 'bg-gray-100 text-gray-600 hover:bg-gray-100',
}

const stageLabels: Record<string, string> = {
  not_applied: 'Not Applied',
  applied: 'Applied',
  phone_screen: 'Phone Screen',
  technical_screen: 'Technical',
  onsite: 'Onsite',
  offer_received: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
}

export function StageBadge({ stage }: { stage: string }) {
  return (
    <Badge
      variant="secondary"
      className={cn('text-xs font-medium', stageStyles[stage] ?? 'bg-slate-100 text-slate-700')}
    >
      {stageLabels[stage] ?? stage}
    </Badge>
  )
}
