ALTER TABLE "skill_versions" ADD COLUMN IF NOT EXISTS "token_count" integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skill_versions_token_count_idx" ON "skill_versions" USING btree ("token_count");
