DROP TABLE IF EXISTS "skill_downloads";
--> statement-breakpoint
CREATE TABLE "skill_download_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" uuid NOT NULL,
	"date" date DEFAULT now() NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "skill_download_daily" ADD CONSTRAINT "skill_download_daily_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "skill_download_daily_skill_date_idx" ON "skill_download_daily" USING btree ("skill_id","date");
