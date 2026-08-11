-- AlterEnum
ALTER TYPE "BranchOperatingMode" ADD VALUE 'BBQ_WEIGH';

-- CreateEnum
CREATE TYPE "TableSessionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "TableSessionLineKind" AS ENUM ('PIECE', 'WEIGHT');

-- AlterTable
ALTER TABLE "BranchMenuItem" ADD COLUMN "sellByWeight" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BranchMenuItem" ADD COLUMN "pricePerKg" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "DiningTable" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiningTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableSession" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "status" "TableSessionStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "paymentMethod" "PaymentMethod",
    "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "closedTotal" DECIMAL(10,2),
    "note" TEXT,
    "closedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TableSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableSessionLine" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "branchMenuItemId" TEXT,
    "itemName" TEXT NOT NULL,
    "kind" "TableSessionLineKind" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "weightKg" DECIMAL(10,3),
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "lineTotal" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByAdminId" TEXT,

    CONSTRAINT "TableSessionLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiningTable_token_key" ON "DiningTable"("token");

-- CreateIndex
CREATE INDEX "DiningTable_branchId_sortOrder_idx" ON "DiningTable"("branchId", "sortOrder");

-- CreateIndex
CREATE INDEX "TableSession_branchId_status_openedAt_idx" ON "TableSession"("branchId", "status", "openedAt");

-- CreateIndex
CREATE INDEX "TableSession_tableId_status_idx" ON "TableSession"("tableId", "status");

-- CreateIndex
CREATE INDEX "TableSessionLine_sessionId_createdAt_idx" ON "TableSessionLine"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "DiningTable" ADD CONSTRAINT "DiningTable_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSession" ADD CONSTRAINT "TableSession_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSession" ADD CONSTRAINT "TableSession_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "DiningTable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSession" ADD CONSTRAINT "TableSession_closedByAdminId_fkey" FOREIGN KEY ("closedByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSessionLine" ADD CONSTRAINT "TableSessionLine_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TableSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSessionLine" ADD CONSTRAINT "TableSessionLine_branchMenuItemId_fkey" FOREIGN KEY ("branchMenuItemId") REFERENCES "BranchMenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSessionLine" ADD CONSTRAINT "TableSessionLine_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
