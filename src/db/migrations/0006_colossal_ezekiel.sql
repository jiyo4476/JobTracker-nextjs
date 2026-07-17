CREATE TYPE "public"."keyword_preference_enum" AS ENUM('interest', 'exclusion');--> statement-breakpoint
CREATE TYPE "public"."software_familiarity_enum" AS ENUM('learning', 'familiar', 'proficient', 'expert');--> statement-breakpoint
CREATE TABLE "user_certifications" (
	"certification_id" integer PRIMARY KEY NOT NULL,
	"issuer" text,
	"earned_date" date,
	"expires_at" date,
	"credential_url" text,
	CONSTRAINT "user_certifications_dates_check" CHECK ("user_certifications"."earned_date" IS NULL OR "user_certifications"."expires_at" IS NULL OR "user_certifications"."expires_at" >= "user_certifications"."earned_date")
);
--> statement-breakpoint
CREATE TABLE "user_keywords" (
	"keyword_id" integer PRIMARY KEY NOT NULL,
	"preference" "keyword_preference_enum" DEFAULT 'interest' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_software" (
	"software_id" integer PRIMARY KEY NOT NULL,
	"familiarity" "software_familiarity_enum"
);
--> statement-breakpoint
ALTER TABLE "user_certifications" ADD CONSTRAINT "user_certifications_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_keywords" ADD CONSTRAINT "user_keywords_keyword_id_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keywords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_software" ADD CONSTRAINT "user_software_software_id_software_id_fk" FOREIGN KEY ("software_id") REFERENCES "public"."software"("id") ON DELETE cascade ON UPDATE no action;