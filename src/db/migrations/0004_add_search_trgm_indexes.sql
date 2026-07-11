-- GET /api/jobs `q` search OR's ilike(job_title)/ilike(company.name) with a
-- tsvector match on job_description. Postgres can only satisfy an OR via a
-- BitmapOr of per-branch index scans if *every* branch has a supporting
-- index — otherwise it falls back to a full sequential scan for the whole
-- query, silently defeating the jobs_description_search_idx GIN index too.
-- pg_trgm GIN indexes make the two ilike branches indexable so the planner
-- can bitmap-OR all three.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS jobs_job_title_trgm_idx ON jobs USING GIN (job_title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS companies_name_trgm_idx ON companies USING GIN (name gin_trgm_ops);
