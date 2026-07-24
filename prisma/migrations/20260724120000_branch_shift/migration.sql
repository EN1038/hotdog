-- CreateTable
CREATE TABLE "BranchShift" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "calendarDate" DATE NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "openedByStaffId" TEXT,
    "closedByStaffId" TEXT,
    "openingCash" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "BranchShift_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "shiftId" TEXT;

-- CreateIndex
CREATE INDEX "BranchShift_branchId_closedAt_idx" ON "BranchShift"("branchId", "closedAt");

-- CreateIndex
CREATE INDEX "BranchShift_branchId_calendarDate_idx" ON "BranchShift"("branchId", "calendarDate");

-- CreateIndex
CREATE UNIQUE INDEX "BranchShift_branchId_calendarDate_roundNumber_key" ON "BranchShift"("branchId", "calendarDate", "roundNumber");

-- CreateIndex
CREATE INDEX "Order_shiftId_idx" ON "Order"("shiftId");

-- AddForeignKey
ALTER TABLE "BranchShift" ADD CONSTRAINT "BranchShift_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchShift" ADD CONSTRAINT "BranchShift_openedByStaffId_fkey" FOREIGN KEY ("openedByStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchShift" ADD CONSTRAINT "BranchShift_closedByStaffId_fkey" FOREIGN KEY ("closedByStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "BranchShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: open branches get an open shift for today (Bangkok calendar), openingCash = 0
INSERT INTO "BranchShift" ("id", "branchId", "calendarDate", "roundNumber", "openedAt", "closedAt", "openedByStaffId", "closedByStaffId", "openingCash")
SELECT
  replace(gen_random_uuid()::text, '-', ''),
  b."id",
  (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date,
  1,
  CURRENT_TIMESTAMP,
  NULL,
  NULL,
  NULL,
  0
FROM "Branch" b
WHERE b."isOpen" = true
  AND NOT EXISTS (
    SELECT 1 FROM "BranchShift" s
    WHERE s."branchId" = b."id" AND s."closedAt" IS NULL
  );
