-- Manual rollback for migration 0009 (DB-002 RLS phase 1).
-- Removes the owner policy and disables RLS on user_job_priority. Non-destructive to
-- data. Safe to run whether or not the app currently sets the app.user_id GUC.

DROP POLICY IF EXISTS "user_job_priority_owner" ON "user_job_priority";
ALTER TABLE "user_job_priority" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "user_job_priority" DISABLE ROW LEVEL SECURITY;
