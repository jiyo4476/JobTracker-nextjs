CREATE TABLE "user_job_priority" (
	"user_id" integer NOT NULL,
	"job_id" integer NOT NULL,
	"priority" smallint,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_job_priority_user_id_job_id_pk" PRIMARY KEY("user_id","job_id"),
	CONSTRAINT "user_job_priority_priority_range_check" CHECK ("user_job_priority"."priority" IS NULL OR "user_job_priority"."priority" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"email" text,
	"display_name" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resume_versions" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "resume_versions" ADD COLUMN "file_path" text;--> statement-breakpoint
ALTER TABLE "user_certifications" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "user_keywords" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "user_skills" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "user_software" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "user_job_priority" ADD CONSTRAINT "user_job_priority_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_job_priority" ADD CONSTRAINT "user_job_priority_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_job_priority_job_id_idx" ON "user_job_priority" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_issuer_subject_uq" ON "users" USING btree ("issuer","subject");--> statement-breakpoint
ALTER TABLE "resume_versions" ADD CONSTRAINT "resume_versions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_certifications" ADD CONSTRAINT "user_certifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_keywords" ADD CONSTRAINT "user_keywords_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_software" ADD CONSTRAINT "user_software_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resume_versions_user_id_idx" ON "resume_versions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_certifications_user_id_idx" ON "user_certifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_keywords_user_id_idx" ON "user_keywords" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_skills_user_id_idx" ON "user_skills" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_software_user_id_idx" ON "user_software" USING btree ("user_id");