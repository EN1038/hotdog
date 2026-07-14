-- Drop category option templates
DROP TABLE IF EXISTS "CategoryOption";
DROP TABLE IF EXISTS "CategoryOptionGroup";

-- Drop per-menu-item option copies
DROP TABLE IF EXISTS "MenuOption";
DROP TABLE IF EXISTS "MenuOptionGroup";

-- Branch-level option library
CREATE TABLE "BranchOptionGroup" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "maxSelect" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BranchOptionGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BranchOption" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceDelta" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BranchOption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BranchMenuItemOptionGroup" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BranchMenuItemOptionGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BranchMenuItemOptionGroup_menuItemId_groupId_key" ON "BranchMenuItemOptionGroup"("menuItemId", "groupId");

ALTER TABLE "BranchOptionGroup" ADD CONSTRAINT "BranchOptionGroup_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BranchOption" ADD CONSTRAINT "BranchOption_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "BranchOptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BranchMenuItemOptionGroup" ADD CONSTRAINT "BranchMenuItemOptionGroup_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "BranchMenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BranchMenuItemOptionGroup" ADD CONSTRAINT "BranchMenuItemOptionGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "BranchOptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
