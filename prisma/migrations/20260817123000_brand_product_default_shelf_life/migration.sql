-- Master shelf life for warehouse BrandProduct (default 5 days).
-- Expiry on receive is optional; when set, defaults from producedAt + this value.

ALTER TABLE "BrandProduct"
ADD COLUMN IF NOT EXISTS "defaultShelfLifeDays" INTEGER DEFAULT 5;

UPDATE "BrandProduct"
SET "defaultShelfLifeDays" = 5
WHERE "defaultShelfLifeDays" IS NULL;
