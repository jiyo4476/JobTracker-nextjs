-- WARNING: this down step REINTRODUCES the API-014 cross-user IDOR. It drops the
-- owner-first composite primary keys and the NOT NULL owner columns, returning these
-- personal profile tables to a single-tenant shape where one user's rows are
-- indistinguishable from another's. Only run it to roll back a failed deploy, and
-- re-apply 0011 before serving multiple users. (Same hazard convention as
-- 0010_resume_delete_set_null_down.sql.)
--
-- Constraint names below restore what Postgres originally generated: user_software,
-- user_certifications, and user_keywords were created in 0006 with COLUMN-level
-- PRIMARY KEY, so their implicit names are "<table>_pkey". Only user_skills was
-- created (0000) with an explicit table-level constraint named user_skills_skill_id_pk.
ALTER TABLE "user_keywords" DROP CONSTRAINT "user_keywords_user_id_keyword_id_pk";
ALTER TABLE "user_keywords" ADD CONSTRAINT "user_keywords_pkey" PRIMARY KEY("keyword_id");
ALTER TABLE "user_certifications" DROP CONSTRAINT "user_certifications_user_id_certification_id_pk";
ALTER TABLE "user_certifications" ADD CONSTRAINT "user_certifications_pkey" PRIMARY KEY("certification_id");
ALTER TABLE "user_software" DROP CONSTRAINT "user_software_user_id_software_id_pk";
ALTER TABLE "user_software" ADD CONSTRAINT "user_software_pkey" PRIMARY KEY("software_id");
ALTER TABLE "user_skills" DROP CONSTRAINT "user_skills_user_id_skill_id_pk";
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_skill_id_pk" PRIMARY KEY("skill_id");
DROP INDEX "resume_versions_user_id_label_uq";
ALTER TABLE "resume_versions" ADD CONSTRAINT "resume_versions_label_unique" UNIQUE("label");
ALTER TABLE "user_keywords" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "user_certifications" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "user_software" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "user_skills" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "resume_versions" ALTER COLUMN "user_id" DROP NOT NULL;
