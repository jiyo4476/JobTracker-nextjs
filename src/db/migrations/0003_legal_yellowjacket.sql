ALTER TABLE "jobs" DROP CONSTRAINT "jobs_external_dedup";--> statement-breakpoint
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_external_dedup" ON "jobs" USING btree ("external_job_id","source_platform") WHERE "jobs"."external_job_id" IS NOT NULL;