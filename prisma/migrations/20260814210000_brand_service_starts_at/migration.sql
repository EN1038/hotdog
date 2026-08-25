-- Explicit service start date for brand SaaS usage

ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "serviceStartsAt" TIMESTAMP(3);

-- Backfill: use createdAt when missing
UPDATE "Brand"
SET "serviceStartsAt" = "createdAt"
WHERE "serviceStartsAt" IS NULL;
