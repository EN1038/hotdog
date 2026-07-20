-- CreateEnum
CREATE TYPE "OptionGroupMode" AS ENUM ('MANUAL', 'FROM_MENU');

-- AlterTable
ALTER TABLE "BranchOptionGroup" ADD COLUMN "mode" "OptionGroupMode" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "BranchOptionGroup" ADD COLUMN "minSelect" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BranchOptionGroup" ADD COLUMN "allowDuplicateSelections" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "BranchOptionGroupMenuItem" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "priceDelta" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BranchOptionGroupMenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BranchOptionGroupMenuItem_groupId_idx" ON "BranchOptionGroupMenuItem"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "BranchOptionGroupMenuItem_groupId_menuItemId_key" ON "BranchOptionGroupMenuItem"("groupId", "menuItemId");

-- AddForeignKey
ALTER TABLE "BranchOptionGroupMenuItem" ADD CONSTRAINT "BranchOptionGroupMenuItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "BranchOptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchOptionGroupMenuItem" ADD CONSTRAINT "BranchOptionGroupMenuItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "BranchMenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
