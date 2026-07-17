import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/postgres-js'
import { sql } from 'drizzle-orm'
import postgres from 'postgres'
import { buildCompanyDemandQuery } from '@/lib/company-taxonomy-demand'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const describePostgres = testDatabaseUrl ? describe : describe.skip

describePostgres('company taxonomy demand PostgreSQL integration', () => {
  let client: ReturnType<typeof postgres>

  beforeAll(() => {
    client = postgres(testDatabaseUrl!, { max: 1 })
  })

  afterAll(async () => {
    await client?.end({ timeout: 1 })
  })

  it('executes distinct, active, non-deleted, company-scoped, bounded demand SQL', async () => {
    const testDb = drizzle(client)
    await testDb.transaction(async transaction => {
      await transaction.execute(sql.raw(`CREATE TEMP TABLE jobs (
        id integer PRIMARY KEY,
        company_id integer,
        is_active boolean,
        deleted_at timestamptz
      ) ON COMMIT DROP`))
      await transaction.execute(sql.raw(
        'CREATE TEMP TABLE skills (id integer PRIMARY KEY, name text NOT NULL) ON COMMIT DROP',
      ))
      await transaction.execute(sql.raw(
        'CREATE TEMP TABLE job_skills (job_id integer NOT NULL, skill_id integer NOT NULL) ON COMMIT DROP',
      ))

      await transaction.execute(sql.raw(`INSERT INTO skills (id, name)
        SELECT value, 'Skill ' || LPAD(value::text, 2, '0')
        FROM generate_series(1, 12) AS value`))
      await transaction.execute(sql.raw(`INSERT INTO jobs (id, company_id, is_active, deleted_at)
        SELECT value, 7, TRUE, NULL
        FROM generate_series(1, 12) AS value`))
      await transaction.execute(sql.raw(`INSERT INTO job_skills (job_id, skill_id)
        SELECT job_id, skill_id
        FROM generate_series(1, 12) AS skill_id
        CROSS JOIN LATERAL generate_series(skill_id, 12) AS job_id`))

      await transaction.execute(sql.raw(`INSERT INTO jobs (id, company_id, is_active, deleted_at) VALUES
        (20, 7, FALSE, NULL),
        (21, 7, TRUE, NOW()),
        (22, 8, TRUE, NULL)`))
      await transaction.execute(sql.raw(`INSERT INTO job_skills (job_id, skill_id) VALUES
        (1, 1),
        (20, 1),
        (21, 1),
        (22, 1)`))

      const result = await transaction.execute(buildCompanyDemandQuery('skills', 7))
      const rows = Array.from(result) as Array<{ id: number; name: string; jobCount: number }>

      expect(rows).toHaveLength(11)
      expect(rows[0]).toEqual({ id: 1, name: 'Skill 01', jobCount: 12 })
      expect(rows.at(-1)).toEqual({ id: 11, name: 'Skill 11', jobCount: 2 })
    })
  })
})
