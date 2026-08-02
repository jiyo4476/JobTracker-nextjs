-- Manual rollback for migration 0008 (DB-002 expand phase).
--
-- SAFETY: this reverses ONLY the additive expand phase. Because every change in 0008
-- is additive (new tables + nullable columns), rollback is non-destructive to the
-- pre-DB-002 dataset, but it DOES drop the new `users` and `user_job_priority` rows
-- and the backfilled `user_id` / `file_path` values. Export those first if needed.
--
-- Do NOT run this if the CONTRACT phase (NOT NULL / composite-PK swap) has been
-- applied — roll the contract back first.

DROP INDEX IF EXISTS "user_software_user_id_idx";
DROP INDEX IF EXISTS "user_skills_user_id_idx";
DROP INDEX IF EXISTS "user_keywords_user_id_idx";
DROP INDEX IF EXISTS "user_certifications_user_id_idx";
DROP INDEX IF EXISTS "resume_versions_user_id_idx";

ALTER TABLE "user_software" DROP CONSTRAINT IF EXISTS "user_software_user_id_users_id_fk";
ALTER TABLE "user_skills" DROP CONSTRAINT IF EXISTS "user_skills_user_id_users_id_fk";
ALTER TABLE "user_keywords" DROP CONSTRAINT IF EXISTS "user_keywords_user_id_users_id_fk";
ALTER TABLE "user_certifications" DROP CONSTRAINT IF EXISTS "user_certifications_user_id_users_id_fk";
ALTER TABLE "resume_versions" DROP CONSTRAINT IF EXISTS "resume_versions_user_id_users_id_fk";

ALTER TABLE "user_software" DROP COLUMN IF EXISTS "user_id";
ALTER TABLE "user_skills" DROP COLUMN IF EXISTS "user_id";
ALTER TABLE "user_keywords" DROP COLUMN IF EXISTS "user_id";
ALTER TABLE "user_certifications" DROP COLUMN IF EXISTS "user_id";
ALTER TABLE "resume_versions" DROP COLUMN IF EXISTS "file_path";
ALTER TABLE "resume_versions" DROP COLUMN IF EXISTS "user_id";

-- user_job_priority carries FKs to users; drop it before users.
DROP TABLE IF EXISTS "user_job_priority";
DROP TABLE IF EXISTS "users";
