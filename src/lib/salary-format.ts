type SalaryDisplay = {
  salaryType: 'annual' | 'hourly' | null
  salaryMin: number | null
  salaryMax: number | null
  hourlyRateMin: string | null
  hourlyRateMax: string | null
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

export function formatSalary(salary: SalaryDisplay): string {
  if (salary.salaryType === 'annual') {
    const min = positiveNumber(salary.salaryMin)
    const max = positiveNumber(salary.salaryMax)
    if (min == null || max == null) return '—'
    return `${dollars.format(min / 100)} - ${dollars.format(max / 100)} per year`
  }

  if (salary.salaryType === 'hourly') {
    const min = positiveNumber(salary.hourlyRateMin)
    const max = positiveNumber(salary.hourlyRateMax)
    if (min == null || max == null) return '—'
    return `${dollars.format(min)} - ${dollars.format(max)} per hour`
  }

  return '—'
}
