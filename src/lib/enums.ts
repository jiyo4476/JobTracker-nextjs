// Canonical, single-source definitions for every domain enum except
// source_platform (which lives in ./source-platforms.ts, the pattern this
// module mirrors). Each enum exports:
//   - a `*Values` readonly tuple  → feeds Drizzle pgEnum() and Zod z.enum()
//   - a `*` type                  → the value union
//   - `*Options` ({ value, label }[]) → drives <select> menus, full labels
//   - `*Labels` (Record)          → value → display label lookup
// Deriving all of these from one tuple keeps the DB schema, Zod validation,
// and UI menus from drifting apart.

type Option<T extends string> = { value: T; label: string }

function labelsFrom<T extends string>(
  options: ReadonlyArray<Option<T>>,
): Record<T, string> {
  return Object.fromEntries(options.map((o) => [o.value, o.label])) as Record<T, string>
}

// ── interview_stage ────────────────────────────────────────────────────────
export const interviewStageValues = [
  'not_applied',
  'applied',
  'phone_screen',
  'technical_screen',
  'onsite',
  'offer_received',
  'rejected',
  'withdrawn',
] as const
export type InterviewStage = (typeof interviewStageValues)[number]

export const interviewStageOptions: ReadonlyArray<Option<InterviewStage>> = [
  { value: 'not_applied', label: 'Not Applied' },
  { value: 'applied', label: 'Applied' },
  { value: 'phone_screen', label: 'Phone Screen' },
  { value: 'technical_screen', label: 'Technical Screen' },
  { value: 'onsite', label: 'Onsite' },
  { value: 'offer_received', label: 'Offer Received' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
]
export const interviewStageLabels = labelsFrom(interviewStageOptions)

// Compact labels used only by the table/list <StageBadge>, where horizontal
// space is tight. Intentionally shorter than the full option labels above.
export const interviewStageBadgeLabels: Record<InterviewStage, string> = {
  ...interviewStageLabels,
  technical_screen: 'Technical',
  offer_received: 'Offer',
}

export const interviewStageBadgeStyles: Record<InterviewStage, string> = {
  not_applied: 'bg-slate-100 text-slate-700 hover:bg-slate-100',
  applied: 'bg-blue-100 text-blue-700 hover:bg-blue-100',
  phone_screen: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-100',
  technical_screen: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-100',
  onsite: 'bg-orange-100 text-orange-700 hover:bg-orange-100',
  offer_received: 'bg-green-100 text-green-700 hover:bg-green-100',
  rejected: 'bg-red-100 text-red-700 hover:bg-red-100',
  withdrawn: 'bg-gray-100 text-gray-600 hover:bg-gray-100',
}

// Badge `variant` used on the company detail page's stage chips.
export const interviewStageBadgeVariants: Record<
  InterviewStage,
  'default' | 'secondary' | 'destructive'
> = {
  not_applied: 'secondary',
  applied: 'default',
  phone_screen: 'default',
  technical_screen: 'default',
  onsite: 'default',
  offer_received: 'default',
  rejected: 'destructive',
  withdrawn: 'secondary',
}

// ── job_type ───────────────────────────────────────────────────────────────
export const jobTypeValues = [
  'full_time',
  'part_time',
  'contract',
  'internship',
  'temp',
  'freelance',
] as const
export type JobType = (typeof jobTypeValues)[number]

export const jobTypeOptions: ReadonlyArray<Option<JobType>> = [
  { value: 'full_time', label: 'Full Time' },
  { value: 'part_time', label: 'Part Time' },
  { value: 'contract', label: 'Contract' },
  { value: 'internship', label: 'Internship' },
  { value: 'temp', label: 'Temp' },
  { value: 'freelance', label: 'Freelance' },
]
export const jobTypeLabels = labelsFrom(jobTypeOptions)

// ── experience_level ───────────────────────────────────────────────────────
export const experienceLevelValues = ['entry', 'mid', 'senior', 'lead', 'executive'] as const
export type ExperienceLevel = (typeof experienceLevelValues)[number]

export const experienceLevelOptions: ReadonlyArray<Option<ExperienceLevel>> = [
  { value: 'entry', label: 'Entry' },
  { value: 'mid', label: 'Mid' },
  { value: 'senior', label: 'Senior' },
  { value: 'lead', label: 'Lead' },
  { value: 'executive', label: 'Executive' },
]
export const experienceLevelLabels = labelsFrom(experienceLevelOptions)

// ── company_size ───────────────────────────────────────────────────────────
export const companySizeValues = [
  '1-10',
  '11-50',
  '51-200',
  '201-500',
  '501-1000',
  '1001-5000',
  '5000+',
] as const
export type CompanySize = (typeof companySizeValues)[number]

// ── salary_type ────────────────────────────────────────────────────────────
export const salaryTypeValues = ['annual', 'hourly'] as const
export type SalaryType = (typeof salaryTypeValues)[number]

export const salaryTypeOptions: ReadonlyArray<Option<SalaryType>> = [
  { value: 'annual', label: 'Annual' },
  { value: 'hourly', label: 'Hourly' },
]
export const salaryTypeLabels = labelsFrom(salaryTypeOptions)

// ── software_familiarity ───────────────────────────────────────────────────
export const softwareFamiliarityValues = ['learning', 'familiar', 'proficient', 'expert'] as const
export type SoftwareFamiliarity = (typeof softwareFamiliarityValues)[number]

export const softwareFamiliarityOptions: ReadonlyArray<Option<SoftwareFamiliarity>> = [
  { value: 'learning', label: 'Learning' },
  { value: 'familiar', label: 'Familiar' },
  { value: 'proficient', label: 'Proficient' },
  { value: 'expert', label: 'Expert' },
]
export const softwareFamiliarityLabels = labelsFrom(softwareFamiliarityOptions)

// ── keyword_preference ─────────────────────────────────────────────────────
export const keywordPreferenceValues = ['interest', 'exclusion'] as const
export type KeywordPreference = (typeof keywordPreferenceValues)[number]

export const keywordPreferenceOptions: ReadonlyArray<Option<KeywordPreference>> = [
  { value: 'interest', label: 'Interested in' },
  { value: 'exclusion', label: 'Exclude' },
]
export const keywordPreferenceLabels = labelsFrom(keywordPreferenceOptions)
