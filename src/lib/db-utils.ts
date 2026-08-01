import { inArray } from 'drizzle-orm'
import type { db } from '@/db'
import { skills, software, keywords, certifications } from '@/db/schema'

// Escapes Postgres LIKE/ILIKE wildcard metacharacters (%, _, \) so user-supplied
// search text is matched literally instead of being interpreted as a pattern.
export function escapeLikePattern(value: string): string {
  return value.replace(/[%_\\]/g, (c) => `\\${c}`)
}

// The four taxonomy lookup tables share an identical shape: a serial `id` and a
// UNIQUE, NOT NULL `name`. Every "insert these tag names, give me their ids"
// call site operates over one of these tables.
export type LookupTable =
  | typeof skills
  | typeof software
  | typeof keywords
  | typeof certifications

// The helper runs both against the top-level `db` handle (scrape, tag PATCH) and
// inside an open transaction (the backfill routes). Both expose the same
// insert/select builders, so accept either.
type DbHandle = typeof db
type DbTransaction = Parameters<Parameters<DbHandle['transaction']>[0]>[0]
export type LookupExecutor = DbHandle | DbTransaction

/**
 * Insert any lookup-tag names that don't exist yet and return the ids for the
 * full set of names (existing + newly inserted).
 *
 * Standardizes the tag-upsert idiom that was previously reimplemented ~4 times
 * with divergent conflict strategies. The chosen strategy is the safest of the
 * existing ones:
 *
 *   - `INSERT ... ON CONFLICT DO NOTHING RETURNING id, name` — never touches
 *     rows that already exist (no dead tuples / sequence churn, unlike an
 *     `ON CONFLICT DO UPDATE` no-op), and is immune to the "cannot affect row a
 *     second time" error that `DO UPDATE` raises on duplicate names in a batch.
 *   - A single follow-up `SELECT ... WHERE name IN (missing)` resolves the ids
 *     of names that conflicted (already existed, or were inserted by a
 *     concurrent writer that won the insert race).
 *
 * Names are de-duplicated first, so callers don't have to. Order of the
 * returned ids is not significant — every call site uses them only to build
 * junction rows. Returns `[]` for an empty/all-duplicate input without touching
 * the database.
 */
export async function upsertLookupIds(
  executor: LookupExecutor,
  table: LookupTable,
  names: string[],
): Promise<number[]> {
  const uniqueNames = Array.from(new Set(names))
  if (uniqueNames.length === 0) return []

  const inserted = await executor
    .insert(table)
    .values(uniqueNames.map((name) => ({ name })))
    .onConflictDoNothing()
    .returning({ id: table.id, name: table.name })

  const insertedNames = new Set(inserted.map((row) => row.name))
  const missingNames = uniqueNames.filter((name) => !insertedNames.has(name))

  let existing: { id: number }[] = []
  if (missingNames.length > 0) {
    existing = await executor
      .select({ id: table.id })
      .from(table)
      .where(inArray(table.name, missingNames))
  }

  return [...inserted.map((row) => row.id), ...existing.map((row) => row.id)]
}
