function toPositiveThousands(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null

  const thousands = Math.round(value / 100_000)
  return thousands > 0 ? thousands : null
}

export function formatSalary(min: number | null, max: number | null, text: string | null): string {
  const minThousands = toPositiveThousands(min)
  const maxThousands = toPositiveThousands(max)

  if (minThousands != null) {
    return maxThousands != null ? `$${minThousands}k–$${maxThousands}k` : `$${minThousands}k+`
  }
  if (maxThousands != null) return `up to $${maxThousands}k`
  return text?.trim() || '—'
}
