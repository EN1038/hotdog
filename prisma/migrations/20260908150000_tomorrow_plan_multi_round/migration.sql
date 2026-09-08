-- Allow multiple confirmed rounds per branch+planDate (last-write-wins merge for day view).

ALTER TABLE "BranchTomorrowPlan" ADD COLUMN IF NOT EXISTS "roundNo" INTEGER NOT NULL DEFAULT 1;

UPDATE "BranchTomorrowPlan" SET "roundNo" = 1 WHERE "roundNo" IS NULL OR "roundNo" < 1;

DROP INDEX IF EXISTS "BranchTomorrowPlan_branchId_planDate_key";

CREATE UNIQUE INDEX IF NOT EXISTS "BranchTomorrowPlan_branchId_planDate_roundNo_key"
  ON "BranchTomorrowPlan"("branchId", "planDate", "roundNo");

CREATE INDEX IF NOT EXISTS "BranchTomorrowPlan_branchId_planDate_idx"
  ON "BranchTomorrowPlan"("branchId", "planDate");

-- Lines belong to a round (planId); same menu may appear on multiple rounds of the same day.
DROP INDEX IF EXISTS "BranchTomorrowPlanLine_branchId_menuItemId_planDate_key";

CREATE UNIQUE INDEX IF NOT EXISTS "BranchTomorrowPlanLine_planId_menuItemId_key"
  ON "BranchTomorrowPlanLine"("planId", "menuItemId");
