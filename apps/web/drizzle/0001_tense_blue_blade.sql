CREATE TABLE "scan_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"severity" text NOT NULL,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"location" text,
	"confidence" real,
	"tool" text,
	"evidence" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scan_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"verdict" text NOT NULL,
	"total_findings" integer DEFAULT 0 NOT NULL,
	"critical_count" integer DEFAULT 0 NOT NULL,
	"high_count" integer DEFAULT 0 NOT NULL,
	"medium_count" integer DEFAULT 0 NOT NULL,
	"low_count" integer DEFAULT 0 NOT NULL,
	"stages_run" jsonb NOT NULL,
	"duration_ms" integer,
	"file_hashes" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scan_findings" ADD CONSTRAINT "scan_findings_scan_id_scan_results_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scan_results"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_results" ADD CONSTRAINT "scan_results_version_id_skill_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."skill_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scan_findings_scan_id_idx" ON "scan_findings" USING btree ("scan_id");--> statement-breakpoint
CREATE INDEX "scan_findings_severity_idx" ON "scan_findings" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "scan_results_version_id_idx" ON "scan_results" USING btree ("version_id");