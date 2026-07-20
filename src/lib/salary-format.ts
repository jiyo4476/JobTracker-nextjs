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
  const textRange = rangeFromText(salary.salaryText)
  if (textRange) return formatRange(textRange)

  if (salary.salaryType === 'annual') {
    const min = positiveNumber(salary.salaryMin)
    const max = positiveNumber(salary.salaryMax)
    if (min == null || max == null) return '—'
    return formatRange({ min: min / 100, max: max / 100, period: 'year' })
  }

  if (salary.salaryType === 'hourly') {
    const min = positiveNumber(salary.hourlyRateMin)
    const max = positiveNumber(salary.hourlyRateMax)
    if (min == null || max == null) return '—'
    return formatRange({ min, max, period: 'hour' })
  }

  return '—'
}
