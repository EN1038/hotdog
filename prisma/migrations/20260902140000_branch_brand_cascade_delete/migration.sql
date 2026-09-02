-- Cascade branch removal when brand is hard-deleted (prevents orphan branches).
ALTER TABLE "Branch" DROP CONSTRAINT IF EXISTS "Branch_brandId_fkey";
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
