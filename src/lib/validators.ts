import { z } from 'zod'

// Shared, single-source field validators. Import these instead of re-implementing
// URL/date validation per schema — divergent copies drift in strictness (see
// TECHDEBT-006).

// Zod's .url() doesn't restrict scheme (it accepts javascript:/data: URIs), and these
// values get rendered as clickable links in the UI — restrict to http(s) only.
// Capped at 2000 chars to stay within practical URL length limits.
export const httpUrlSchema = z
  .string()
  .url()
  .max(2_000)
  .refine((v) => /^https?:\/\//i.test(v), 'Must be an http(s) URL')

// Strict ISO date (YYYY-MM-DD) that also validates the calendar, so impossible
// dates like 2024-99-99 or 2026-02-30 are rejected — a bare /^\d{4}-\d{2}-\d{2}$/
// regex would accept them.
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be ISO date (YYYY-MM-DD)')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    )
  }, 'Must be a valid calendar date')
