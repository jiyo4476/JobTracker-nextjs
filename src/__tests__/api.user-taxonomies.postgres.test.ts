import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/postgres-js'
import { sql } from 'drizzle-orm'
import postgres from 'postgres'
import { buildGapDemandQuery } from '@/lib/taxonomy-gap-demand'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const describePostgres = testDatabaseUrl ? describe : describe.skip

type DemandRow = { taxonomy_id: number; name: string; job_count: number }
class Rollback extends Error {}

/**
 * Opt-in check that the generated owner/title-scoping SQL behaves correctly on a real
 * PostgreSQL engine. It runs against `ON COMMIT DROP` TEMP tables that shadow `jobs` and
 * `user_job_state`, so it exercises query logic only — not the real schema, its constraints,
 * or the RLS policies added in migration 0009.
 */
describePostgres('taxonomy gap demand PostgreSQL integration', () => {
  let client: ReturnType<typeof postgres>

  beforeAll(() => { client = postgres(testDatabaseUrl!, { max: 1 }) })
  afterAll(async () => { await client?.end({ timeout: 1 }) })

  async function withFixture(run: (tx: { execute: (query: unknown) => Promise<unknown> }) => Promise<void>) {
    const testDb = drizzle(client)
    await testDb.transaction(async transaction => {
      await transaction.execute(sql.raw(`CREATE TEMP TABLE jobs (
        id integer PRIMARY KEY, job_title text NOT NULL, is_active boolean NOT NULL,
        deleted_at timestamptz
      ) ON COMMIT DROP`))
      await transaction.execute(sql.raw(`CREATE TEMP TABLE user_job_state (
        user_id integer NOT NULL, job_id integer NOT NULL,
        is_hidden boolean NOT NULL DEFAULT FALSE
      ) ON COMMIT DROP`))
      await transaction.execute(sql.raw(
        'CREATE TEMP TABLE skills (id integer PRIMARY KEY, name text NOT NULL) ON COMMIT DROP',
      ))
      await transaction.execute(sql.raw(
        'CREATE TEMP TABLE job_skills (job_id integer NOT NULL, skill_id integer NOT NULL) ON COMMIT DROP',
      ))
      await transaction.execute(sql.raw("INSERT INTO skills (id, name) VALUES (1, 'PostgreSQL')"))
      await transaction.execute(sql.raw(`INSERT INTO jobs (id, job_title, is_active, deleted_at) VALUES
        (1, 'Senior Data Engineer', TRUE, NULL),
        (2, '100% Remote Data Engineer', TRUE, NULL),
        (3, 'Security Analyst', TRUE, NULL),
        (4, 'Deleted Data Engineer', TRUE, NOW())`))
      await transaction.execute(sql.raw(
        'INSERT INTO job_skills (job_id, skill_id) SELECT id, 1 FROM jobs',
      ))
      await run(transaction as unknown as { execute: (query: unknown) => Promise<unknown> })
      throw new Rollback()
    }).catch((error: unknown) => {
      if (!(error instanceof Rollback)) throw error
    })
  }

  async function demand(
    tx: { execute: (query: unknown) => Promise<unknown> },
    userId: number,
    jobTitle?: string,
  ) {
    const result = await tx.execute(buildGapDemandQuery({
      category: 'skills', userId, nameQuery: '', jobTitle,
    }))
    return Array.from(result as Iterable<DemandRow>)
  }

  it('excludes other owners, hidden/deleted jobs, and honors literal title matching', async () => {
    await withFixture(async tx => {
      await tx.execute(sql.raw(`INSERT INTO user_job_state (user_id, job_id, is_hidden) VALUES
        (1, 1, FALSE), (1, 2, FALSE), (1, 3, TRUE), (1, 4, FALSE),
        (2, 1, FALSE), (2, 2, FALSE), (2, 3, FALSE)`))

      await expect(demand(tx, 1)).resolves.toEqual([
        { taxonomy_id: 1, name: 'PostgreSQL', job_count: 2 },
      ])
      await expect(demand(tx, 2)).resolves.toEqual([
        { taxonomy_id: 1, name: 'PostgreSQL', job_count: 3 },
      ])
      await expect(demand(tx, 1, '100%')).resolves.toEqual([
        { taxonomy_id: 1, name: 'PostgreSQL', job_count: 1 },
      ])
      await expect(demand(tx, 1, 'Security')).resolves.toEqual([])
    })
  })
})
