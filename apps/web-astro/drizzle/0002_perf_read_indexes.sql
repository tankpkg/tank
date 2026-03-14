-- Performance indexes for read-heavy query paths (Task 6)
-- Replaces single-column indexes with composites where ORDER BY/MAX patterns benefit.
-- New indexes for JOIN keys and sort columns used by all P0/P1 read routes.

-- skill_versions: composite (skill_id, created_at) replaces single-column skill_id index.
-- Covers: MAX(created_at) subquery in search, ORDER BY created_at DESC in detail/versions.
DROP INDEX IF EXISTS "skill_versions_skill_id_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skill_versions_skill_id_created_at_idx" ON "skill_versions" USING btree ("skill_id","created_at");--> statement-breakpoint

-- scan_results: composite (version_id, created_at) replaces single-column version_id index.
-- Covers: LATERAL (ORDER BY created_at DESC LIMIT 1) in version detail route.
DROP INDEX IF EXISTS "scan_results_version_id_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scan_results_version_id_created_at_idx" ON "scan_results" USING btree ("version_id","created_at");--> statement-breakpoint

-- skills: publisher_id index for JOIN key (every read query joins publishers ON p.id = s.publisher_id).
CREATE INDEX IF NOT EXISTS "skills_publisher_id_idx" ON "skills" USING btree ("publisher_id");--> statement-breakpoint

-- skills: updated_at index for default browse ORDER BY (non-search list path).
CREATE INDEX IF NOT EXISTS "skills_updated_at_idx" ON "skills" USING btree ("updated_at");
