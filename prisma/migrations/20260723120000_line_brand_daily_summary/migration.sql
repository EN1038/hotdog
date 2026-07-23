-- Brand-owner LINE link + daily operating-day summary at branch cutoff

ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "lineUserId" TEXT;
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "lineNotifyEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "lineNotifyDailySummary" BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS "Admin_lineUserId_key" ON "Admin"("lineUserId");

ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "lineNotifyBrandDailySummary" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "LineDailySummaryLog" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "operatingDay" DATE NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "LineDailySummaryLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LineDailySummaryLog_branchId_operatingDay_key"
  ON "LineDailySummaryLog"("branchId", "operatingDay");

CREATE INDEX IF NOT EXISTS "LineDailySummaryLog_sentAt_idx"
  ON "LineDailySummaryLog"("sentAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LineDailySummaryLog_branchId_fkey'
  ) THEN
    ALTER TABLE "LineDailySummaryLog"
      ADD CONSTRAINT "LineDailySummaryLog_branchId_fkey"
      FOREIGN KEY ("branchId") REFERENCES "Branch"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
