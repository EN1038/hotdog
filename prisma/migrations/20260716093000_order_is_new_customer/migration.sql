-- AlterTable
ALTER TABLE "Order" ADD COLUMN "isNewCustomer" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: first order per (customerId, branchId) by createdAt, then id
UPDATE "Order" AS o
SET "isNewCustomer" = true
FROM (
  SELECT DISTINCT ON ("customerId", "branchId") id
  FROM "Order"
  ORDER BY "customerId", "branchId", "createdAt" ASC, id ASC
) AS first_orders
WHERE o.id = first_orders.id;
