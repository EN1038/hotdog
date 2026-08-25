-- สต๊อกกลาง = สาขาชนิด WAREHOUSE (ตั้งชื่อ / สิทธิ์พนักงาน / ไม่มีเมนูขาย)

DO $$ BEGIN
  CREATE TYPE "BranchKind" AS ENUM ('STORE', 'WAREHOUSE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "WarehouseIssueMode" AS ENUM ('TRANSFER', 'ISSUE', 'BOTH');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "kind" "BranchKind" NOT NULL DEFAULT 'STORE';
ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "warehouseIssueMode" "WarehouseIssueMode" NOT NULL DEFAULT 'TRANSFER';
ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "warehouseAllowedBranchIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS "Branch_brandId_kind_idx" ON "Branch"("brandId", "kind");
