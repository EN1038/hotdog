-- Detach menu items from global categories, then rebuild MenuCategory as branch-scoped
UPDATE "BranchMenuItem" SET "categoryId" = NULL;

DELETE FROM "MenuCategory";

DROP INDEX IF EXISTS "MenuCategory_name_key";

ALTER TABLE "MenuCategory" ADD COLUMN IF NOT EXISTS "branchId" TEXT NOT NULL DEFAULT '';

-- Clear invalid rows if any lingered with empty branchId (table already empty)
DELETE FROM "MenuCategory" WHERE "branchId" = '';

ALTER TABLE "MenuCategory" ALTER COLUMN "branchId" DROP DEFAULT;

CREATE UNIQUE INDEX IF NOT EXISTS "MenuCategory_branchId_name_key" ON "MenuCategory"("branchId", "name");

ALTER TABLE "MenuCategory" DROP CONSTRAINT IF EXISTS "MenuCategory_branchId_fkey";
ALTER TABLE "MenuCategory" ADD CONSTRAINT "MenuCategory_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "BranchShareCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sourceBranchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BranchShareCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BranchShareCode_code_key" ON "BranchShareCode"("code");

ALTER TABLE "BranchShareCode" DROP CONSTRAINT IF EXISTS "BranchShareCode_sourceBranchId_fkey";
ALTER TABLE "BranchShareCode" ADD CONSTRAINT "BranchShareCode_sourceBranchId_fkey" FOREIGN KEY ("sourceBranchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
