export const sourcePlatformValues = [
  'linkedin',
  'indeed',
  'glassdoor',
  'dice',
  'lever',
  'greenhouse',
  'workday',
  'angellist',
  'direct',
  'other',
  'google',
] as const

export type SourcePlatform = typeof sourcePlatformValues[number]

export const sourcePlatformOptions: ReadonlyArray<{
  value: SourcePlatform
  label: string
}> = [
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'indeed', label: 'Indeed' },
  { value: 'glassdoor', label: 'Glassdoor' },
  { value: 'dice', label: 'Dice' },
  { value: 'lever', label: 'Lever' },
  { value: 'greenhouse', label: 'Greenhouse' },
  { value: 'workday', label: 'Workday' },
  { value: 'angellist', label: 'AngelList' },
  { value: 'direct', label: 'Direct' },
  { value: 'other', label: 'Other' },
  { value: 'google', label: 'Google' },
]

export const sourcePlatformLabels = Object.fromEntries(
  sourcePlatformOptions.map(({ value, label }) => [value, label])
) as Record<SourcePlatform, string>

export function getSourcePlatformLabel(value: string | null | undefined): string {
  if (!value) return '—'
  return value in sourcePlatformLabels
    ? sourcePlatformLabels[value as SourcePlatform]
    : value
}
