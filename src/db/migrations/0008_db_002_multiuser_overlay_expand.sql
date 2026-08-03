CREATE TABLE "user_job_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"job_id" integer NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"email" text,
	"phone" text,
	"linkedin_url" text,
	"role" text,
	"contacted_at" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_job_state" (
	"user_id" integer NOT NULL,
	"job_id" integer NOT NULL,
	"priority" smallint,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"has_applied" boolean DEFAULT false NOT NULL,
	"date_applied" date,
	"heard_back" boolean DEFAULT false NOT NULL,
	"interview_stage" "interview_stage_enum" DEFAULT 'not_applied' NOT NULL,
	"referral" boolean DEFAULT false NOT NULL,
	"cover_letter_submitted" boolean DEFAULT false NOT NULL,
	"resume_version_id" integer,
	"rejection_reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_job_state_user_id_job_id_pk" PRIMARY KEY("user_id","job_id"),
	CONSTRAINT "user_job_state_priority_range_check" CHECK ("user_job_state"."priority" IS NULL OR "user_job_state"."priority" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "user_job_status_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"job_id" integer NOT NULL,
	"from_stage" "interview_stage_enum",
	"to_stage" "interview_stage_enum" NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE UNIQUE INDEX "resume_versions_user_id_id_uq" ON "resume_versions" USING btree ("user_id","id");--> statement-breakpoint
ALTER TABLE "user_job_contacts" ADD CONSTRAINT "user_job_contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_job_contacts" ADD CONSTRAINT "user_job_contacts_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_job_contacts" ADD CONSTRAINT "user_job_contacts_state_fk" FOREIGN KEY ("user_id","job_id") REFERENCES "public"."user_job_state"("user_id","job_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_job_state" ADD CONSTRAINT "user_job_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_job_state" ADD CONSTRAINT "user_job_state_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_job_state" ADD CONSTRAINT "user_job_state_owner_resume_fk" FOREIGN KEY ("user_id","resume_version_id") REFERENCES "public"."resume_versions"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_job_status_history" ADD CONSTRAINT "user_job_status_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_job_status_history" ADD CONSTRAINT "user_job_status_history_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_job_status_history" ADD CONSTRAINT "user_job_status_history_state_fk" FOREIGN KEY ("user_id","job_id") REFERENCES "public"."user_job_state"("user_id","job_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_job_contacts_user_job_idx" ON "user_job_contacts" USING btree ("user_id","job_id");--> statement-breakpoint
CREATE INDEX "user_job_contacts_job_id_idx" ON "user_job_contacts" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "user_job_state_job_id_idx" ON "user_job_state" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "user_job_state_user_stage_idx" ON "user_job_state" USING btree ("user_id","interview_stage");--> statement-breakpoint
CREATE INDEX "user_job_state_user_applied_idx" ON "user_job_state" USING btree ("user_id","has_applied");--> statement-breakpoint
CREATE INDEX "user_job_state_user_priority_idx" ON "user_job_state" USING btree ("user_id","priority");--> statement-breakpoint
CREATE INDEX "user_job_state_resume_version_id_idx" ON "user_job_state" USING btree ("resume_version_id");--> statement-breakpoint
CREATE INDEX "user_job_status_history_user_job_changed_idx" ON "user_job_status_history" USING btree ("user_id","job_id","changed_at");--> statement-breakpoint
CREATE INDEX "user_job_status_history_job_id_idx" ON "user_job_status_history" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_issuer_subject_uq" ON "users" USING btree ("issuer","subject");--> statement-breakpoint
ALTER TABLE "resume_versions" ADD CONSTRAINT "resume_versions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE FUNCTION "clear_deleted_resume_from_user_job_state"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	UPDATE "user_job_state"
	SET "resume_version_id" = NULL
	WHERE "user_id" = OLD."user_id" AND "resume_version_id" = OLD."id";
	RETURN OLD;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "resume_versions_clear_user_job_state_before_delete"
BEFORE DELETE ON "resume_versions"
FOR EACH ROW EXECUTE FUNCTION "clear_deleted_resume_from_user_job_state"();--> statement-breakpoint
ALTER TABLE "user_certifications" ADD CONSTRAINT "user_certifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_keywords" ADD CONSTRAINT "user_keywords_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_software" ADD CONSTRAINT "user_software_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resume_versions_user_id_idx" ON "resume_versions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_certifications_user_id_idx" ON "user_certifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_keywords_user_id_idx" ON "user_keywords" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_skills_user_id_idx" ON "user_skills" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_software_user_id_idx" ON "user_software" USING btree ("user_id");
