-- Pre-migration safety check for 0007_careful_morbius.sql (TECHDEBT-007 / PR #73).
--
-- Migration 0007 adds NOT NULL to 9 columns and two CHECK constraints on `jobs`.
-- All 9 columns carry defaults, so the migration is backfill-free — BUT if any
-- pre-existing row was explicitly set to NULL, or violates the new CHECKs, the
-- ALTER TABLE will FAIL on apply. Run this against the TARGET database BEFORE
-- `npm run db:migrate`. Every query below must return 0. Any non-zero result is
-- a row that must be corrected first.
--
-- Usage:  psql "$DATABASE_URL" -f scripts/precheck-0007-schema-hardening.sql
-- (or paste into Drizzle Studio / pgAdmin).

\echo '== Rows that would violate the 9 new NOT NULL constraints (each must be 0) =='
SELECT
  count(*) FILTER (WHERE is_active              IS NULL) AS is_active_nulls,
  count(*) FILTER (WHERE is_remote              IS NULL) AS is_remote_nulls,
  count(*) FILTER (WHERE has_applied            IS NULL) AS has_applied_nulls,
  count(*) FILTER (WHERE heard_back             IS NULL) AS heard_back_nulls,
  count(*) FILTER (WHERE security_clearance_req IS NULL) AS security_clearance_req_nulls,
  count(*) FILTER (WHERE referral               IS NULL) AS referral_nulls,
  count(*) FILTER (WHERE cover_letter_submitted IS NULL) AS cover_letter_submitted_nulls,
  count(*) FILTER (WHERE created_at             IS NULL) AS created_at_nulls,
  count(*) FILTER (WHERE updated_at             IS NULL) AS updated_at_nulls
FROM jobs;

\echo '== Rows that would violate jobs_priority_range_check (must be 0) =='
-- CHECK: priority IS NULL OR priority BETWEEN 1 AND 5
SELECT count(*) AS priority_out_of_range
FROM jobs
WHERE priority IS NOT NULL AND (priority < 1 OR priority > 5);

\echo '== Rows that would violate jobs_salary_min_max_check (must be 0) =='
-- CHECK: salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max
SELECT count(*) AS salary_min_gt_max
FROM jobs
WHERE salary_min IS NOT NULL AND salary_max IS NOT NULL AND salary_min > salary_max;

\echo '== Offending rows (IDs) for manual correction, if any of the above were > 0 =='
SELECT id, priority, salary_min, salary_max
FROM jobs
WHERE (priority IS NOT NULL AND (priority < 1 OR priority > 5))
   OR (salary_min IS NOT NULL AND salary_max IS NOT NULL AND salary_min > salary_max)
   OR is_active IS NULL OR is_remote IS NULL OR has_applied IS NULL
   OR heard_back IS NULL OR security_clearance_req IS NULL OR referral IS NULL
   OR cover_letter_submitted IS NULL OR created_at IS NULL OR updated_at IS NULL
ORDER BY id;
