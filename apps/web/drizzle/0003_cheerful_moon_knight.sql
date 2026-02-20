-- Merge publishers table into user table

-- Step 1: Drop foreign key constraints that reference publishers
ALTER TABLE "skill_versions" DROP CONSTRAINT IF EXISTS "skill_versions_published_by_publishers_id_fk";--> statement-breakpoint
ALTER TABLE "skills" DROP CONSTRAINT IF EXISTS "skills_publisher_id_publishers_id_fk";--> statement-breakpoint

-- Step 2: Alter column types from uuid to text
ALTER TABLE "skill_versions" ALTER COLUMN "published_by" SET DATA TYPE text USING "published_by"::text;--> statement-breakpoint
ALTER TABLE "skills" ALTER COLUMN "publisher_id" SET DATA TYPE text USING "publisher_id"::text;--> statement-breakpoint

-- Step 3: Migrate publisher IDs to user IDs in skills table
UPDATE "skills" 
SET "publisher_id" = p."user_id"
FROM "publishers" p
WHERE "skills"."publisher_id" = p."id"::text;--> statement-breakpoint

-- Step 4: Migrate publisher IDs to user IDs in skill_versions table
UPDATE "skill_versions" 
SET "published_by" = p."user_id"
FROM "publishers" p
WHERE "skill_versions"."published_by" = p."id"::text;--> statement-breakpoint

-- Step 5: Drop the publishers table
ALTER TABLE "publishers" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "publishers" CASCADE;--> statement-breakpoint

-- Step 6: Drop old indexes that will be recreated
DROP INDEX IF EXISTS "scan_results_version_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "skill_versions_skill_id_idx";--> statement-breakpoint

-- Step 7: Add github_username column to user table
ALTER TABLE "user" ADD COLUMN "github_username" text;--> statement-breakpoint

-- Step 8: Add new foreign key constraints
ALTER TABLE "skill_versions" ADD CONSTRAINT "skill_versions_published_by_user_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_publisher_id_user_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Step 9: Recreate indexes with new composite indexes for performance
CREATE INDEX "scan_results_version_id_created_at_idx" ON "scan_results" USING btree ("version_id","created_at");--> statement-breakpoint
CREATE INDEX "skill_versions_skill_id_created_at_idx" ON "skill_versions" USING btree ("skill_id","created_at");--> statement-breakpoint
CREATE INDEX "skills_publisher_id_idx" ON "skills" USING btree ("publisher_id");--> statement-breakpoint
CREATE INDEX "skills_updated_at_idx" ON "skills" USING btree ("updated_at");--> statement-breakpoint

-- Step 10: Add unique constraint on github_username
ALTER TABLE "user" ADD CONSTRAINT "user_github_username_unique" UNIQUE("github_username");
