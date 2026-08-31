-- CreateEnum
CREATE TYPE "BranchMenuItemParStockSource" AS ENUM ('MANUAL', 'RECOMMENDED');

-- CreateTable
CREATE TABLE "BranchMenuItemParStock" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "parStock" INTEGER NOT NULL DEFAULT 0,
    "source" "BranchMenuItemParStockSource" NOT NULL DEFAULT 'MANUAL',
    "coverageDays" INTEGER,
    "safetyPct" INTEGER,
    "avgDailySales" DECIMAL(10,2),
    "recommendedValue" INTEGER,
    "analysisFrom" DATE,
    "analysisTo" DATE,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByAdminId" TEXT,

    CONSTRAINT "BranchMenuItemParStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchMenuItemParStockHistory" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "oldParStock" INTEGER NOT NULL,
    "newParStock" INTEGER NOT NULL,
    "source" "BranchMenuItemParStockSource" NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "updatedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BranchMenuItemParStockHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BranchMenuItemParStock_menuItemId_key" ON "BranchMenuItemParStock"("menuItemId");

-- CreateIndex
CREATE INDEX "BranchMenuItemParStock_branchId_idx" ON "BranchMenuItemParStock"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "BranchMenuItemParStock_branchId_menuItemId_key" ON "BranchMenuItemParStock"("branchId", "menuItemId");

-- CreateIndex
CREATE INDEX "BranchMenuItemParStockHistory_branchId_menuItemId_createdAt_idx" ON "BranchMenuItemParStockHistory"("branchId", "menuItemId", "createdAt");

-- CreateIndex
CREATE INDEX "BranchMenuItemParStockHistory_menuItemId_idx" ON "BranchMenuItemParStockHistory"("menuItemId");

-- AddForeignKey
ALTER TABLE "BranchMenuItemParStock" ADD CONSTRAINT "BranchMenuItemParStock_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchMenuItemParStock" ADD CONSTRAINT "BranchMenuItemParStock_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "BranchMenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchMenuItemParStock" ADD CONSTRAINT "BranchMenuItemParStock_updatedByAdminId_fkey" FOREIGN KEY ("updatedByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchMenuItemParStockHistory" ADD CONSTRAINT "BranchMenuItemParStockHistory_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchMenuItemParStockHistory" ADD CONSTRAINT "BranchMenuItemParStockHistory_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "BranchMenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchMenuItemParStockHistory" ADD CONSTRAINT "BranchMenuItemParStockHistory_updatedByAdminId_fkey" FOREIGN KEY ("updatedByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
