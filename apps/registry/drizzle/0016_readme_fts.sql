-- Full-text search on SKILL.md / README.md content.
-- STORED generated tsvector (computed on write, not per query).
-- 'english' config matches skills_search_idx for consistent stemming.
-- No trigram on readme — body too large; typo tolerance stays name-only (see 0010).
ALTER TABLE "skill_versions"
  ADD COLUMN IF NOT EXISTS "readme_tsv" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce("readme", ''))) STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skill_versions_readme_tsv_idx"
  ON "skill_versions" USING gin ("readme_tsv");
