-- Primary owner + manual billing ledger for brand SaaS accounts

DO $$ BEGIN
  CREATE TYPE "BrandInvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'VOID');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "primaryAdminId" TEXT;
ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "billingNote" TEXT;
ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "lastPaidAt" TIMESTAMP(3);
ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "nextDueAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Brand_primaryAdminId_idx" ON "Brand"("primaryAdminId");

DO $$ BEGIN
  ALTER TABLE "Brand"
    ADD CONSTRAINT "Brand_primaryAdminId_fkey"
    FOREIGN KEY ("primaryAdminId") REFERENCES "Admin"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "BrandInvoice" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "amountBaht" DECIMAL(10,2) NOT NULL,
  "status" "BrandInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
  "periodLabel" TEXT,
  "issuedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdByAdminId" TEXT,
  CONSTRAINT "BrandInvoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BrandInvoice_brandId_number_key" ON "BrandInvoice"("brandId", "number");
CREATE INDEX IF NOT EXISTS "BrandInvoice_brandId_createdAt_idx" ON "BrandInvoice"("brandId", "createdAt");
CREATE INDEX IF NOT EXISTS "BrandInvoice_brandId_status_idx" ON "BrandInvoice"("brandId", "status");

DO $$ BEGIN
  ALTER TABLE "BrandInvoice"
    ADD CONSTRAINT "BrandInvoice_brandId_fkey"
    FOREIGN KEY ("brandId") REFERENCES "Brand"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BrandInvoice"
    ADD CONSTRAINT "BrandInvoice_createdByAdminId_fkey"
    FOREIGN KEY ("createdByAdminId") REFERENCES "Admin"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Backfill primary owner = earliest OWNER membership (else earliest member)
UPDATE "Brand" b
SET "primaryAdminId" = sub."adminId"
FROM (
  SELECT DISTINCT ON (bm."brandId")
    bm."brandId",
    bm."adminId"
  FROM "BrandMember" bm
  INNER JOIN "Admin" a ON a."id" = bm."adminId"
  WHERE a."isPlatformAdmin" = false
  ORDER BY
    bm."brandId",
    CASE WHEN bm."role" = 'OWNER' THEN 0 ELSE 1 END,
    bm."createdAt" ASC
) AS sub
WHERE b."id" = sub."brandId"
  AND b."primaryAdminId" IS NULL;
