-- DB-002 RLS phase 1. Policies consume transaction-local app.user_id.
ALTER TABLE "user_job_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_job_state" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_job_contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_job_contacts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_job_status_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_job_status_history" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "user_job_state_owner" ON "user_job_state" FOR ALL
  USING ("user_id" = NULLIF(current_setting('app.user_id', true), '')::int)
  WITH CHECK ("user_id" = NULLIF(current_setting('app.user_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "user_job_contacts_owner" ON "user_job_contacts" FOR ALL
  USING ("user_id" = NULLIF(current_setting('app.user_id', true), '')::int)
  WITH CHECK ("user_id" = NULLIF(current_setting('app.user_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "user_job_status_history_select" ON "user_job_status_history" FOR SELECT
  USING ("user_id" = NULLIF(current_setting('app.user_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "user_job_status_history_insert" ON "user_job_status_history" FOR INSERT
  WITH CHECK ("user_id" = NULLIF(current_setting('app.user_id', true), '')::int);
