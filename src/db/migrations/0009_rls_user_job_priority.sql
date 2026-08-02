-- DB-002 — Row-Level Security, phase 1 (first target: user_job_priority).
--
-- See "RLS Rollout Plan.md" in the Obsidian vault for the full ordering. This is the
-- FIRST target because user_job_priority is net-new with no existing readers, so
-- enabling RLS here cannot break any current single-user route. The remaining
-- owner-scoped tables (resume_versions, user_skills, user_software,
-- user_certifications, user_keywords) are deliberately NOT enabled here: their live
-- routes do not yet set the owner session context, so enabling RLS on them now would
-- break reads. They move to RLS in SEC-001 once routes call withUser().
--
-- Contract: the application sets `app.user_id` per transaction via
-- src/db/session.ts::withUser(). Owner predicates in application code remain
-- mandatory regardless of RLS (ADR-005) — RLS is defense in depth only.
--
-- NOTE ON EFFECTIVENESS: a PostgreSQL SUPERUSER (and any role with BYPASSRLS) is not
-- subject to RLS. The local/Docker `postgres` superuser therefore bypasses these
-- policies; RLS becomes an effective second barrier only when the app connects as a
-- NOSUPERUSER role (planned for Neon/production). FORCE ROW LEVEL SECURITY below makes
-- the policies apply even to the table's OWNER, so an owner-but-not-superuser app role
-- is fully covered.

ALTER TABLE "user_job_priority" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_job_priority" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- Single FOR ALL policy: a row is visible/writable only when it belongs to the user
-- id in the current transaction's `app.user_id` GUC. When the GUC is unset,
-- current_setting(..., true) returns NULL, NULLIF collapses an empty string to NULL,
-- and `user_id = NULL` is never true — so the table fails closed (no rows, no writes).
CREATE POLICY "user_job_priority_owner" ON "user_job_priority"
  FOR ALL
  USING ("user_id" = NULLIF(current_setting('app.user_id', true), '')::int)
  WITH CHECK ("user_id" = NULLIF(current_setting('app.user_id', true), '')::int);
