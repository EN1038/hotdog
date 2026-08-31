-- Confirmed production/refill quantities per branch × menu × plan date

CREATE TABLE "BranchTomorrowPlanLine" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "planDate" TEXT NOT NULL,
    "confirmedQty" INTEGER NOT NULL,
    "suggestedQty" INTEGER NOT NULL,
    "parStock" INTEGER NOT NULL DEFAULT 0,
    "availableStock" INTEGER NOT NULL DEFAULT 0,
    "confirmedAt" TIMESTAMP(3) NOT NULL,
    "confirmedByAdminId" TEXT,

    CONSTRAINT "BranchTomorrowPlanLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BranchTomorrowPlanLine_branchId_menuItemId_planDate_key" ON "BranchTomorrowPlanLine"("branchId", "menuItemId", "planDate");
CREATE INDEX "BranchTomorrowPlanLine_branchId_planDate_idx" ON "BranchTomorrowPlanLine"("branchId", "planDate");
CREATE INDEX "BranchTomorrowPlanLine_menuItemId_idx" ON "BranchTomorrowPlanLine"("menuItemId");

ALTER TABLE "BranchTomorrowPlanLine" ADD CONSTRAINT "BranchTomorrowPlanLine_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BranchTomorrowPlanLine" ADD CONSTRAINT "BranchTomorrowPlanLine_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "BranchMenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BranchTomorrowPlanLine" ADD CONSTRAINT "BranchTomorrowPlanLine_confirmedByAdminId_fkey" FOREIGN KEY ("confirmedByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
