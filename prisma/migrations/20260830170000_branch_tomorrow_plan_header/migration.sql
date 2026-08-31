-- CreateEnum
CREATE TYPE "BranchTomorrowPlanStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

-- CreateTable
CREATE TABLE "BranchTomorrowPlan" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "planDate" TEXT NOT NULL,
    "status" "BranchTomorrowPlanStatus" NOT NULL DEFAULT 'CONFIRMED',
    "note" TEXT,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "confirmedByAdminId" TEXT,

    CONSTRAINT "BranchTomorrowPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BranchTomorrowPlan_branchId_planDate_key" ON "BranchTomorrowPlan"("branchId", "planDate");
CREATE INDEX "BranchTomorrowPlan_branchId_status_idx" ON "BranchTomorrowPlan"("branchId", "status");
CREATE INDEX "BranchTomorrowPlan_planDate_idx" ON "BranchTomorrowPlan"("planDate");

ALTER TABLE "BranchTomorrowPlan" ADD CONSTRAINT "BranchTomorrowPlan_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BranchTomorrowPlan" ADD CONSTRAINT "BranchTomorrowPlan_confirmedByAdminId_fkey" FOREIGN KEY ("confirmedByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BranchTomorrowPlanLine" ADD COLUMN IF NOT EXISTS "planId" TEXT;
CREATE INDEX IF NOT EXISTS "BranchTomorrowPlanLine_planId_idx" ON "BranchTomorrowPlanLine"("planId");

INSERT INTO "BranchTomorrowPlan" ("id", "branchId", "planDate", "status", "confirmedAt", "updatedAt", "confirmedByAdminId")
SELECT
  ('tpl_' || md5("branchId" || ':' || "planDate")),
  "branchId",
  "planDate",
  'CONFIRMED',
  MAX("confirmedAt"),
  MAX("confirmedAt"),
  (ARRAY_AGG("confirmedByAdminId" ORDER BY "confirmedAt" DESC))[1]
FROM "BranchTomorrowPlanLine"
GROUP BY "branchId", "planDate"
ON CONFLICT ("branchId", "planDate") DO NOTHING;

UPDATE "BranchTomorrowPlanLine" AS line
SET "planId" = plan."id"
FROM "BranchTomorrowPlan" AS plan
WHERE line."planId" IS NULL
  AND plan."branchId" = line."branchId"
  AND plan."planDate" = line."planDate";

ALTER TABLE "BranchTomorrowPlanLine" ADD CONSTRAINT "BranchTomorrowPlanLine_planId_fkey" FOREIGN KEY ("planId") REFERENCES "BranchTomorrowPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
