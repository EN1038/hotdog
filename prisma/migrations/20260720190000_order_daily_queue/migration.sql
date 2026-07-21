-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "queueNumber" INTEGER;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "queueBusinessDate" DATE;

-- Backfill per branch per Bangkok calendar day
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "branchId", (("createdAt" AT TIME ZONE 'Asia/Bangkok')::date)
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn,
    (("createdAt" AT TIME ZONE 'Asia/Bangkok')::date) AS biz_date
  FROM "Order"
)
UPDATE "Order" o
SET
  "queueNumber" = r.rn,
  "queueBusinessDate" = r.biz_date
FROM ranked r
WHERE o.id = r.id;

UPDATE "Order"
SET
  "queueNumber" = 1,
  "queueBusinessDate" = (("createdAt" AT TIME ZONE 'Asia/Bangkok')::date)
WHERE "queueNumber" IS NULL;

ALTER TABLE "Order" ALTER COLUMN "queueNumber" SET NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "queueBusinessDate" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Order_branchId_queueBusinessDate_queueNumber_key"
  ON "Order" ("branchId", "queueBusinessDate", "queueNumber");

CREATE INDEX IF NOT EXISTS "Order_branchId_queueBusinessDate_idx"
  ON "Order" ("branchId", "queueBusinessDate");
