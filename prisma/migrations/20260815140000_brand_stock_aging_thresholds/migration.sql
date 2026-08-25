-- Brand-level fresh stock aging alert thresholds (defaults: warn 2, critical 3)
ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "stockAgingWarnDays" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "stockAgingCriticalDays" INTEGER NOT NULL DEFAULT 3;
