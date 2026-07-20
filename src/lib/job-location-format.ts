const CITY_STATE_ZIP = /([A-Za-z][A-Za-z .'-]*?),\s*([A-Z]{2})(?:\s+(\d{5}(?:-\d{4})?))?/g

export function formatJobLocation(location: string | null, isRemote: boolean | null): string {
  const value = location?.trim() ?? ''
  const matches = [...value.matchAll(CITY_STATE_ZIP)]
  const match = matches.at(-1)
  const place = match
    ? `${match[1].trim()}, ${match[2].toUpperCase()}${match[3] ? ` ${match[3]}` : ''}`
    : ''
  const workMode = /\bhybrid\b/i.test(value)
    ? 'Hybrid'
    : isRemote || /\bremote\b/i.test(value)
      ? 'Remote'
      : null

  if (place && workMode) return `${place} (${workMode})`
  if (place) return place
  if (workMode) return workMode
  return '—'
}
