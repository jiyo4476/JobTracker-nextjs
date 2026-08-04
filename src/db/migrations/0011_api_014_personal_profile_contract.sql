-- API-014 CONTRACT: personal profile rows must have a resolved owner before
-- uniqueness can safely change from global catalog IDs to per-owner IDs.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM resume_versions WHERE user_id IS NULL)
    OR EXISTS (SELECT 1 FROM user_skills WHERE user_id IS NULL)
    OR EXISTS (SELECT 1 FROM user_software WHERE user_id IS NULL)
    OR EXISTS (SELECT 1 FROM user_certifications WHERE user_id IS NULL)
    OR EXISTS (SELECT 1 FROM user_keywords WHERE user_id IS NULL) THEN
    RAISE EXCEPTION 'API-014 requires the DB-002 legacy-owner backfill before CONTRACT migration';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "resume_versions" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_skills" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_software" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_certifications" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_keywords" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "resume_versions" DROP CONSTRAINT "resume_versions_label_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "resume_versions_user_id_label_uq" ON "resume_versions" USING btree ("user_id","label");--> statement-breakpoint
ALTER TABLE "user_skills" DROP CONSTRAINT "user_skills_skill_id_pk";--> statement-breakpoint
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_user_id_skill_id_pk" PRIMARY KEY("user_id","skill_id");--> statement-breakpoint
ALTER TABLE "user_software" DROP CONSTRAINT "user_software_pkey";--> statement-breakpoint
ALTER TABLE "user_software" ADD CONSTRAINT "user_software_user_id_software_id_pk" PRIMARY KEY("user_id","software_id");--> statement-breakpoint
ALTER TABLE "user_certifications" DROP CONSTRAINT "user_certifications_pkey";--> statement-breakpoint
ALTER TABLE "user_certifications" ADD CONSTRAINT "user_certifications_user_id_certification_id_pk" PRIMARY KEY("user_id","certification_id");--> statement-breakpoint
ALTER TABLE "user_keywords" DROP CONSTRAINT "user_keywords_pkey";--> statement-breakpoint
ALTER TABLE "user_keywords" ADD CONSTRAINT "user_keywords_user_id_keyword_id_pk" PRIMARY KEY("user_id","keyword_id");
