CREATE TABLE "skill_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" uuid NOT NULL,
	"granted_user_id" text,
	"granted_org_id" text,
	"granted_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_access_skill_user_uniq" UNIQUE("skill_id","granted_user_id"),
	CONSTRAINT "skill_access_skill_org_uniq" UNIQUE("skill_id","granted_org_id"),
	CONSTRAINT "skill_access_subject_present" CHECK ("skill_access"."granted_user_id" IS NOT NULL OR "skill_access"."granted_org_id" IS NOT NULL),
	CONSTRAINT "skill_access_single_subject" CHECK (NOT ("skill_access"."granted_user_id" IS NOT NULL AND "skill_access"."granted_org_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "skill_access" ADD CONSTRAINT "skill_access_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_access" ADD CONSTRAINT "skill_access_granted_user_id_user_id_fk" FOREIGN KEY ("granted_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_access" ADD CONSTRAINT "skill_access_granted_org_id_organization_id_fk" FOREIGN KEY ("granted_org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_access" ADD CONSTRAINT "skill_access_granted_by_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "skill_access_skill_id_idx" ON "skill_access" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "skill_access_granted_user_id_idx" ON "skill_access" USING btree ("granted_user_id");--> statement-breakpoint
CREATE INDEX "skill_access_granted_org_id_idx" ON "skill_access" USING btree ("granted_org_id");