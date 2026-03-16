ALTER TABLE "skills" ADD COLUMN IF NOT EXISTS "visibility" text DEFAULT 'public' NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skills_visibility_idx" ON "skills" USING btree ("visibility");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'skills_visibility_valid'
  ) THEN
    ALTER TABLE "skills"
    ADD CONSTRAINT "skills_visibility_valid"
    CHECK ("skills"."visibility" in ('public', 'private'));
  END IF;
END $$;
