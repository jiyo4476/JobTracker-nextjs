ALTER TABLE "jobs" ALTER COLUMN "is_remote" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "has_applied" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "heard_back" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "is_active" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "security_clearance_req" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "referral" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "cover_letter_submitted" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "contacts_job_id_idx" ON "contacts" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "job_status_history_job_id_idx" ON "job_status_history" USING btree ("job_id");--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_priority_range_check" CHECK ("jobs"."priority" IS NULL OR "jobs"."priority" BETWEEN 1 AND 5);--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_salary_min_max_check" CHECK ("jobs"."salary_min" IS NULL OR "jobs"."salary_max" IS NULL OR "jobs"."salary_min" <= "jobs"."salary_max");