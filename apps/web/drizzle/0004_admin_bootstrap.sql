ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "role" text NOT NULL DEFAULT 'user';

CREATE INDEX IF NOT EXISTS "user_role_idx" ON "user" ("role");

CREATE TABLE IF NOT EXISTS "user_status" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "reason" text,
  "banned_by" text,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_status_status_check"
    CHECK ("status" IN ('active', 'suspended', 'banned')),
  CONSTRAINT "user_status_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE,
  CONSTRAINT "user_status_banned_by_user_id_fk"
    FOREIGN KEY ("banned_by") REFERENCES "user" ("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "user_status_user_idx" ON "user_status" ("user_id");
CREATE INDEX IF NOT EXISTS "user_status_status_idx" ON "user_status" ("status");

ALTER TABLE "skills"
  ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "status_reason" text,
  ADD COLUMN IF NOT EXISTS "status_changed_by" text,
  ADD COLUMN IF NOT EXISTS "status_changed_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "featured" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "featured_by" text,
  ADD COLUMN IF NOT EXISTS "featured_at" timestamp with time zone;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'skills_status_check'
  ) THEN
    ALTER TABLE "skills"
      ADD CONSTRAINT "skills_status_check"
      CHECK ("status" IN ('active', 'deprecated', 'quarantined', 'removed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "skills_status_idx" ON "skills" ("status");
