-- DB-002 fix: make resume_versions delete independent of route-level RLS context.
--
-- The 0008 BEFORE DELETE trigger nulled user_job_state.resume_version_id via a plain
-- UPDATE, which is subject to FORCE ROW LEVEL SECURITY on user_job_state (0009). Under a
-- non-bypass application role with no app.user_id set, that UPDATE matched zero rows and
-- the ON DELETE NO ACTION composite FK then rejected the delete.
--
-- Replace the trigger with a column-targeted ON DELETE SET NULL (resume_version_id) on the
-- composite FK. PostgreSQL performs FK referential actions as internal RI operations that
-- bypass RLS, so the reference is nulled on delete regardless of connecting role or GUC.
-- The column list is required: a plain SET NULL would also null user_id (NOT NULL, PK).
DROP TRIGGER IF EXISTS "resume_versions_clear_user_job_state_before_delete" ON "resume_versions";--> statement-breakpoint
DROP FUNCTION IF EXISTS "clear_deleted_resume_from_user_job_state"();--> statement-breakpoint
ALTER TABLE "user_job_state" DROP CONSTRAINT "user_job_state_owner_resume_fk";--> statement-breakpoint
ALTER TABLE "user_job_state" ADD CONSTRAINT "user_job_state_owner_resume_fk" FOREIGN KEY ("user_id","resume_version_id") REFERENCES "public"."resume_versions"("user_id","id") ON DELETE SET NULL ("resume_version_id") ON UPDATE no action;
