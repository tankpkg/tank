ALTER TABLE "scan_results" ADD COLUMN IF NOT EXISTS "info_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "scan_findings" ADD COLUMN IF NOT EXISTS "remediation" text;
ALTER TABLE "scan_findings" ADD COLUMN IF NOT EXISTS "cwe_id" text;
