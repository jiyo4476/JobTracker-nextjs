// Salary is stored as integer cents for annual figures; hourly rates are decimal
// dollars converted to an annual-equivalent for unified filtering/analytics.
export const HOURS_PER_YEAR = 2080 // 40 h/week × 52 weeks
export const CENTS_PER_DOLLAR = 100

/**
 * Convert an hourly rate (decimal dollars) to annual-equivalent integer cents:
 * `hourly × 2080 × 100`. Passes through null/undefined so callers can map
 * optional/nullable patch fields directly.
 */
export function hourlyToAnnualEquivalentCents<T extends number | null | undefined>(
  hourly: T,
): T extends number ? number : T {
  if (hourly == null) return hourly as T extends number ? number : T
  return Math.round(hourly * HOURS_PER_YEAR * CENTS_PER_DOLLAR) as T extends number ? number : T
}

type SalaryDisplay = {
  salaryType: 'annual' | 'hourly' | null
  salaryMin: number | null
  salaryMax: number | null
  hourlyRateMin: string | null
  hourlyRateMax: string | null
  salaryText: string | null
}

type SalaryRange = {
  min: number
  max: number
  period: 'year' | 'hour'
}

const dollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function positiveNumber(value: number | string | null): number | null {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function rangeFromText(text: string | null): SalaryRange | null {
  if (!text) return null

  const amounts = [...text.matchAll(/\$\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)\s*([kK])?/g)]
    .slice(0, 2)
    .map(([, amount, thousands]) => Number(amount.replaceAll(',', '')) * (thousands ? 1000 : 1))
  if (
    amounts.length !== 2 ||
    amounts.some(amount => !Number.isFinite(amount) || amount <= 0) ||
    amounts[0] > amounts[1]
  ) {
    return null
  }

  const explicitlyHourly = /(?:\/\s*(?:hr|hour)\b|\bper\s+hour\b|\bhourly\b)/i.test(text)
  const explicitlyAnnual = /(?:\/\s*(?:yr|year)\b|\bper\s+year\b|\bannual(?:ly)?\b)/i.test(text)
  const period = explicitlyHourly
    ? 'hour'
    : explicitlyAnnual || Math.max(...amounts) >= 1000
      ? 'year'
      : 'hour'

  return { min: amounts[0], max: amounts[1], period }
}

function formatRange({ min, max, period }: SalaryRange): string {
  return `${dollars.format(min)} - ${dollars.format(max)} per ${period}`
}

export function formatSalary(salary: SalaryDisplay): string {
  // Prefer the authoritative structured cents / hourly-rate columns; only fall
  // back to the raw free-text range when the structured values are absent, so a
  // stale or garbled `salary_text` can never override validated data.
  if (salary.salaryType === 'annual') {
    const min = positiveNumber(salary.salaryMin)
    const max = positiveNumber(salary.salaryMax)
    if (min != null && max != null) {
      return formatRange({ min: min / 100, max: max / 100, period: 'year' })
    }
  } else if (salary.salaryType === 'hourly') {
    const min = positiveNumber(salary.hourlyRateMin)
    const max = positiveNumber(salary.hourlyRateMax)
    if (min != null && max != null) {
      return formatRange({ min, max, period: 'hour' })
    }
  }

  const textRange = rangeFromText(salary.salaryText)
  if (textRange) return formatRange(textRange)

  return '—'
}

/**
 * Compact "$150k"-style label for a single annual salary figure in integer
 * cents (e.g. a company's average max), rounded to the nearest thousand
 * dollars. Returns the em-dash placeholder for null/zero/negative input.
 *
 * Shared by the companies list and detail views, which previously each carried
 * their own divergent copy of this `/100000` → "k" formatter.
 */
export function formatSalaryShort(cents: number | null | undefined): string {
  if (!cents || cents <= 0) return '—'
  return '$' + Math.round(cents / 100000) + 'k'
}

/**
 * Compact salary range in "$120k – $150k" form from two annual-cent bounds,
 * built on {@link formatSalaryShort}. Falls back to the single present bound,
 * and to the em-dash placeholder when neither is set.
 */
export function formatSalaryRangeShort(
  min: number | null | undefined,
  max: number | null | undefined,
): string {
  if (!min && !max) return '—'
  if (min && max) return `${formatSalaryShort(min)} – ${formatSalaryShort(max)}`
  return formatSalaryShort(min ?? max)
}

/** Structured salary column values derived from a free-text salary string. */
export type StructuredSalary = {
  salaryType: 'annual' | 'hourly'
  salaryMin: number | null
  salaryMax: number | null
  hourlyRateMin: string | null
  hourlyRateMax: string | null
  annualEquivalentMin: number | null
  annualEquivalentMax: number | null
}

/**
 * Derive structured salary columns from a free-text `salary_text` string, reusing
 * the exact parser {@link formatSalary} uses to display it — so a backfill fills
 * the structured columns with the same range the UI already shows.
 *
 * Annual ranges become integer cents (`dollars × 100`); hourly ranges become
 * `numeric(10,2)` strings plus an `annual_equivalent_*` in cents
 * (`hourly × 2080 × 100`). Returns `null` when the text can't be parsed into a
 * valid range, so callers can skip the row untouched.
 *
 * Used by `scripts/backfill-structured-salary.ts` to make the structured columns
 * authoritative for legacy rows that only ever had `salary_text`
 * (see the `formatSalary` precedence flip in TECHDEBT-009).
 */
export function structuredSalaryFromText(text: string | null): StructuredSalary | null {
  const range = rangeFromText(text)
  if (!range) return null

  if (range.period === 'year') {
    const salaryMin = Math.round(range.min * CENTS_PER_DOLLAR)
    const salaryMax = Math.round(range.max * CENTS_PER_DOLLAR)
    return {
      salaryType: 'annual',
      salaryMin,
      salaryMax,
      hourlyRateMin: null,
      hourlyRateMax: null,
      annualEquivalentMin: salaryMin,
      annualEquivalentMax: salaryMax,
    }
  }

  return {
    salaryType: 'hourly',
    salaryMin: null,
    salaryMax: null,
    hourlyRateMin: range.min.toFixed(2),
    hourlyRateMax: range.max.toFixed(2),
    annualEquivalentMin: hourlyToAnnualEquivalentCents(range.min),
    annualEquivalentMax: hourlyToAnnualEquivalentCents(range.max),
  }
}
