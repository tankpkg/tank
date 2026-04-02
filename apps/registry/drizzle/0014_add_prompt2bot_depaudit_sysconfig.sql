-- prompt2bot columns on skill_versions
ALTER TABLE "skill_versions" ADD COLUMN IF NOT EXISTS "prompt2bot_bot_id" text;
ALTER TABLE "skill_versions" ADD COLUMN IF NOT EXISTS "prompt2bot_chat_link" text;
ALTER TABLE "skill_versions" ADD COLUMN IF NOT EXISTS "prompt2bot_bot_public_key" text;
ALTER TABLE "skill_versions" ADD COLUMN IF NOT EXISTS "prompt2bot_secret" text;

-- dep_audit_results table
CREATE TABLE IF NOT EXISTS "dep_audit_results" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "version_id" uuid NOT NULL REFERENCES "skill_versions"("id"),
  "ecosystem" text NOT NULL,
  "package_count" integer NOT NULL DEFAULT 0,
  "vulnerable_count" integer NOT NULL DEFAULT 0,
  "vuln_summary" jsonb,
  "packages" jsonb,
  "tldr" text,
  "health_score" real,
  "sources_queried" jsonb,
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "dep_audit_results_version_id_created_at_idx" ON "dep_audit_results" ("version_id", "created_at");

-- system_config table (on-prem setup wizard)
CREATE TABLE IF NOT EXISTS "system_config" (
  "id" integer PRIMARY KEY DEFAULT 1,
  "setup_completed" boolean NOT NULL DEFAULT false,
  "instance_url" text,
  "auth_secret" text,
  "storage_backend" text DEFAULT 's3',
  "storage_endpoint" text,
  "storage_region" text,
  "storage_bucket" text,
  "storage_access_key" text,
  "storage_secret_key_enc" text,
  "storage_public_endpoint" text,
  "supabase_url" text,
  "supabase_service_key_enc" text,
  "scanner_provider" text DEFAULT 'disabled',
  "scanner_api_key_enc" text,
  "scanner_base_url" text,
  "scanner_model" text,
  "scanner_litellm_url" text,
  "github_enabled" boolean NOT NULL DEFAULT false,
  "github_client_id" text,
  "github_client_secret_enc" text,
  "oidc_enabled" boolean NOT NULL DEFAULT false,
  "oidc_discovery_url" text,
  "oidc_client_id" text,
  "oidc_client_secret_enc" text,
  "oidc_provider_id" text DEFAULT 'enterprise-oidc',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
