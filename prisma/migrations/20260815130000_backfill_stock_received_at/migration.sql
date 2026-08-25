-- Legacy sale stock-ins: default receive day = day recorded (createdAt)
UPDATE "BranchMenuItemStockHistory"
SET "receivedAt" = "createdAt"
WHERE "receivedAt" IS NULL
  AND "type" IN ('STOCK_IN', 'RESTOCK')
  AND "quantity" > 0;
