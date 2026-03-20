ALTER TABLE "apikey" ADD COLUMN IF NOT EXISTS "reference_id" text;
ALTER TABLE "apikey" ADD COLUMN IF NOT EXISTS "config_id" text;
