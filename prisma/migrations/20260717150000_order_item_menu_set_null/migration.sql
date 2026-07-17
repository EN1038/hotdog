-- Allow deleting BranchMenuItem even when referenced by past orders.
-- Order history keeps itemName (and other snapshot fields); the FK is cleared.

ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_branchMenuItemId_fkey";

ALTER TABLE "OrderItem" ALTER COLUMN "branchMenuItemId" DROP NOT NULL;

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_branchMenuItemId_fkey" FOREIGN KEY ("branchMenuItemId") REFERENCES "BranchMenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
