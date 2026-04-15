ALTER TABLE "skill_versions" ADD COLUMN IF NOT EXISTS "atom_kinds" text[];
CREATE INDEX IF NOT EXISTS "skill_versions_atom_kinds_idx" ON "skill_versions" USING GIN ("atom_kinds");
