-- CreateEnum
CREATE TYPE "KitchenProductionStatus" AS ENUM ('COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BranchStockRequestStatus" AS ENUM ('PENDING', 'FULFILLED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "KitchenProduction" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "stockLocationId" TEXT NOT NULL,
    "finishedProductId" TEXT NOT NULL,
    "quantityProduced" INTEGER NOT NULL,
    "quantityWasted" INTEGER NOT NULL DEFAULT 0,
    "status" "KitchenProductionStatus" NOT NULL DEFAULT 'COMPLETED',
    "note" TEXT,
    "lotNumber" TEXT,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KitchenProduction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenProductionComponent" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "brandProductId" TEXT NOT NULL,
    "quantityPlanned" INTEGER NOT NULL,
    "quantityUsed" INTEGER NOT NULL,

    CONSTRAINT "KitchenProductionComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchStockRequest" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "brandProductId" TEXT NOT NULL,
    "quantityRequested" INTEGER NOT NULL,
    "quantityFulfilled" INTEGER NOT NULL DEFAULT 0,
    "status" "BranchStockRequestStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "adminNote" TEXT,
    "requestedByStaffId" TEXT,
    "fulfilledByAdminId" TEXT,
    "transferId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "fulfilledAt" TIMESTAMP(3),

    CONSTRAINT "BranchStockRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KitchenProduction_brandId_completedAt_idx" ON "KitchenProduction"("brandId", "completedAt");

-- CreateIndex
CREATE INDEX "KitchenProduction_finishedProductId_completedAt_idx" ON "KitchenProduction"("finishedProductId", "completedAt");

-- CreateIndex
CREATE INDEX "KitchenProduction_status_completedAt_idx" ON "KitchenProduction"("status", "completedAt");

-- CreateIndex
CREATE INDEX "KitchenProductionComponent_brandProductId_idx" ON "KitchenProductionComponent"("brandProductId");

-- CreateIndex
CREATE UNIQUE INDEX "KitchenProductionComponent_productionId_brandProductId_key" ON "KitchenProductionComponent"("productionId", "brandProductId");

-- CreateIndex
CREATE INDEX "BranchStockRequest_brandId_status_createdAt_idx" ON "BranchStockRequest"("brandId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "BranchStockRequest_branchId_status_createdAt_idx" ON "BranchStockRequest"("branchId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "BranchStockRequest_brandProductId_idx" ON "BranchStockRequest"("brandProductId");

-- AddForeignKey
ALTER TABLE "KitchenProduction" ADD CONSTRAINT "KitchenProduction_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenProduction" ADD CONSTRAINT "KitchenProduction_stockLocationId_fkey" FOREIGN KEY ("stockLocationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenProduction" ADD CONSTRAINT "KitchenProduction_finishedProductId_fkey" FOREIGN KEY ("finishedProductId") REFERENCES "BrandProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenProduction" ADD CONSTRAINT "KitchenProduction_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenProductionComponent" ADD CONSTRAINT "KitchenProductionComponent_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "KitchenProduction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenProductionComponent" ADD CONSTRAINT "KitchenProductionComponent_brandProductId_fkey" FOREIGN KEY ("brandProductId") REFERENCES "BrandProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchStockRequest" ADD CONSTRAINT "BranchStockRequest_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchStockRequest" ADD CONSTRAINT "BranchStockRequest_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchStockRequest" ADD CONSTRAINT "BranchStockRequest_brandProductId_fkey" FOREIGN KEY ("brandProductId") REFERENCES "BrandProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchStockRequest" ADD CONSTRAINT "BranchStockRequest_requestedByStaffId_fkey" FOREIGN KEY ("requestedByStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchStockRequest" ADD CONSTRAINT "BranchStockRequest_fulfilledByAdminId_fkey" FOREIGN KEY ("fulfilledByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
