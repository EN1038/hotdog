-- All brands: orange at 3–4 days, red at ≥ 5 days
ALTER TABLE "Brand" ALTER COLUMN "stockAgingWarnDays" SET DEFAULT 3;
ALTER TABLE "Brand" ALTER COLUMN "stockAgingCriticalDays" SET DEFAULT 5;
UPDATE "Brand" SET "stockAgingWarnDays" = 3, "stockAgingCriticalDays" = 5;
