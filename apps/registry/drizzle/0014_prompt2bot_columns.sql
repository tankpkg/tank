ALTER TABLE "skill_versions" ADD COLUMN IF NOT EXISTS "prompt2bot_bot_id" text;
ALTER TABLE "skill_versions" ADD COLUMN IF NOT EXISTS "prompt2bot_chat_link" text;
ALTER TABLE "skill_versions" ADD COLUMN IF NOT EXISTS "prompt2bot_bot_public_key" text;
ALTER TABLE "skill_versions" ADD COLUMN IF NOT EXISTS "prompt2bot_secret" text;
