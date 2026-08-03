-- Reverse 0010: restore the ON DELETE NO ACTION composite FK plus the BEFORE DELETE
-- trigger/function that nulled user_job_state.resume_version_id (as defined in 0008).
ALTER TABLE "user_job_state" DROP CONSTRAINT "user_job_state_owner_resume_fk";

ALTER TABLE "user_job_state" ADD CONSTRAINT "user_job_state_owner_resume_fk" FOREIGN KEY ("user_id","resume_version_id") REFERENCES "public"."resume_versions"("user_id","id") ON DELETE no action ON UPDATE no action;

CREATE FUNCTION "clear_deleted_resume_from_user_job_state"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	UPDATE "user_job_state"
	SET "resume_version_id" = NULL
	WHERE "user_id" = OLD."user_id" AND "resume_version_id" = OLD."id";
	RETURN OLD;
END;
$$;

CREATE TRIGGER "resume_versions_clear_user_job_state_before_delete"
BEFORE DELETE ON "resume_versions"
FOR EACH ROW EXECUTE FUNCTION "clear_deleted_resume_from_user_job_state"();
