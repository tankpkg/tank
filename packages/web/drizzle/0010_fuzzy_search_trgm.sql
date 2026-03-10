-- Enable pg_trgm extension for fuzzy/trigram search on skill names.
-- This powers typo-tolerant search (e.g. "recat" → "@tank/react") and
-- ILIKE-backed prefix matching (e.g. "@tank/re" → "@tank/react").
--
-- NOTE: On Supabase, run via SQL Editor or enable pg_trgm from the
-- Extensions dashboard. On self-hosted PG, the superuser must run this.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
-- GIN trigram index on skill names for fast ILIKE and similarity() queries.
-- The existing skills_search_idx (tsvector GIN) handles full-text search;
-- this index handles partial matching and typo tolerance.
CREATE INDEX IF NOT EXISTS "skills_name_trgm_idx" ON "skills" USING gin ("name" gin_trgm_ops);
