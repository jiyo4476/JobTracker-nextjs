-- Run 0009 down first. This removes only DB-002 EXPAND objects and nullable columns.
DROP TRIGGER IF EXISTS "resume_versions_clear_user_job_state_before_delete" ON "resume_versions";
DROP FUNCTION IF EXISTS "clear_deleted_resume_from_user_job_state"();

DROP TABLE IF EXISTS "user_job_status_history";
DROP TABLE IF EXISTS "user_job_contacts";
DROP TABLE IF EXISTS "user_job_state";

DROP INDEX IF EXISTS "user_software_user_id_idx";
DROP INDEX IF EXISTS "user_skills_user_id_idx";
DROP INDEX IF EXISTS "user_keywords_user_id_idx";
DROP INDEX IF EXISTS "user_certifications_user_id_idx";
DROP INDEX IF EXISTS "resume_versions_user_id_idx";

ALTER TABLE "user_software" DROP COLUMN IF EXISTS "user_id";
ALTER TABLE "user_skills" DROP COLUMN IF EXISTS "user_id";
ALTER TABLE "user_keywords" DROP COLUMN IF EXISTS "user_id";
ALTER TABLE "user_certifications" DROP COLUMN IF EXISTS "user_id";
ALTER TABLE "resume_versions" DROP COLUMN IF EXISTS "file_path";
ALTER TABLE "resume_versions" DROP COLUMN IF EXISTS "user_id";

DROP TABLE IF EXISTS "users";
