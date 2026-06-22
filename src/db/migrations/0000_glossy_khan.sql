CREATE TYPE "public"."company_size_enum" AS ENUM('1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5000+');--> statement-breakpoint
CREATE TYPE "public"."experience_level_enum" AS ENUM('entry', 'mid', 'senior', 'lead', 'executive');--> statement-breakpoint
CREATE TYPE "public"."interview_stage_enum" AS ENUM('not_applied', 'applied', 'phone_screen', 'technical_screen', 'onsite', 'offer_received', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."job_type_enum" AS ENUM('full_time', 'part_time', 'contract', 'internship', 'temp', 'freelance');--> statement-breakpoint
CREATE TYPE "public"."salary_type_enum" AS ENUM('annual', 'hourly');--> statement-breakpoint
CREATE TYPE "public"."source_platform_enum" AS ENUM('linkedin', 'indeed', 'glassdoor', 'dice', 'lever', 'greenhouse', 'workday', 'angellist', 'direct', 'other');--> statement-breakpoint
CREATE TABLE "certifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "certifications_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"website" text,
	"industry" text,
	"size_range" "company_size_enum",
	"hq_location" text,
	"glassdoor_url" text,
	"linkedin_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "companies_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" serial PRIMARY KEY NOT NULL,
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
CREATE TABLE "job_certifications" (
	"job_id" integer NOT NULL,
	"certification_id" integer NOT NULL,
	"is_required" boolean DEFAULT true,
	CONSTRAINT "job_certifications_job_id_certification_id_pk" PRIMARY KEY("job_id","certification_id")
);
--> statement-breakpoint
CREATE TABLE "job_keywords" (
	"job_id" integer NOT NULL,
	"keyword_id" integer NOT NULL,
	CONSTRAINT "job_keywords_job_id_keyword_id_pk" PRIMARY KEY("job_id","keyword_id")
);
--> statement-breakpoint
CREATE TABLE "job_skills" (
	"job_id" integer NOT NULL,
	"skill_id" integer NOT NULL,
	"is_required" boolean DEFAULT true,
	CONSTRAINT "job_skills_job_id_skill_id_pk" PRIMARY KEY("job_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "job_software" (
	"job_id" integer NOT NULL,
	"software_id" integer NOT NULL,
	CONSTRAINT "job_software_job_id_software_id_pk" PRIMARY KEY("job_id","software_id")
);
--> statement-breakpoint
CREATE TABLE "job_status_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"from_stage" "interview_stage_enum",
	"to_stage" "interview_stage_enum" NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"job_title" text NOT NULL,
	"job_link" text,
	"job_location" text,
	"is_remote" boolean DEFAULT false,
	"source_platform" "source_platform_enum",
	"external_job_id" text,
	"job_type" "job_type_enum",
	"experience_level" "experience_level_enum",
	"job_description" text,
	"salary_type" "salary_type_enum",
	"salary_min" integer,
	"salary_max" integer,
	"hourly_rate_min" numeric(10, 2),
	"hourly_rate_max" numeric(10, 2),
	"annual_equivalent_min" integer,
	"annual_equivalent_max" integer,
	"salary_text" text,
	"salary_currency" char(3) DEFAULT 'USD',
	"has_applied" boolean DEFAULT false,
	"date_applied" date,
	"heard_back" boolean DEFAULT false,
	"interview_stage" "interview_stage_enum" DEFAULT 'not_applied',
	"date_posted" date,
	"date_found" date,
	"last_scraped_at" timestamp with time zone,
	"is_active" boolean DEFAULT true,
	"deleted_at" timestamp with time zone,
	"application_deadline" date,
	"posting_md_path" text,
	"security_clearance_req" boolean DEFAULT false,
	"priority" smallint,
	"referral" boolean DEFAULT false,
	"cover_letter_submitted" boolean DEFAULT false,
	"resume_version" text,
	"rejection_reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "jobs_external_dedup" UNIQUE NULLS NOT DISTINCT("external_job_id","source_platform")
);
--> statement-breakpoint
CREATE TABLE "keywords" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "keywords_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "resume_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "resume_versions_label_unique" UNIQUE("label")
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "skills_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "software" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "software_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "user_skills" (
	"skill_id" integer NOT NULL,
	"has_skill" boolean DEFAULT false NOT NULL,
	CONSTRAINT "user_skills_skill_id_pk" PRIMARY KEY("skill_id")
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_certifications" ADD CONSTRAINT "job_certifications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_certifications" ADD CONSTRAINT "job_certifications_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_keywords" ADD CONSTRAINT "job_keywords_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_keywords" ADD CONSTRAINT "job_keywords_keyword_id_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keywords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_skills" ADD CONSTRAINT "job_skills_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_skills" ADD CONSTRAINT "job_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_software" ADD CONSTRAINT "job_software_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_software" ADD CONSTRAINT "job_software_software_id_software_id_fk" FOREIGN KEY ("software_id") REFERENCES "public"."software"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_status_history" ADD CONSTRAINT "job_status_history_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_company_id_idx" ON "jobs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "jobs_interview_stage_idx" ON "jobs" USING btree ("interview_stage");--> statement-breakpoint
CREATE INDEX "jobs_date_found_idx" ON "jobs" USING btree ("date_found");--> statement-breakpoint
CREATE INDEX "jobs_is_active_idx" ON "jobs" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "jobs_source_platform_idx" ON "jobs" USING btree ("source_platform");--> statement-breakpoint
CREATE INDEX "jobs_priority_idx" ON "jobs" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "jobs_last_scraped_at_idx" ON "jobs" USING btree ("last_scraped_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS jobs_description_search_idx ON jobs USING GIN (to_tsvector('english', coalesce(job_description, '')));