CREATE TABLE "skill_stars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_stars_skill_user_uniq" UNIQUE("skill_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "skill_stars" ADD CONSTRAINT "skill_stars_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_stars" ADD CONSTRAINT "skill_stars_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "skill_stars_skill_id_idx" ON "skill_stars" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "skill_stars_user_id_idx" ON "skill_stars" USING btree ("user_id");