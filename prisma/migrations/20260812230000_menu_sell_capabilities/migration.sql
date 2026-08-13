-- Master sell capabilities on branch menu items (one product, many sell modes)
ALTER TABLE "BranchMenuItem" ADD COLUMN IF NOT EXISTS "sellPiece" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BranchMenuItem" ADD COLUMN IF NOT EXISTS "sellSkewer" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BranchMenuItem" ADD COLUMN IF NOT EXISTS "sellGrill" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BranchMenuItem" ADD COLUMN IF NOT EXISTS "sellFry" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BranchMenuItem" ADD COLUMN IF NOT EXISTS "sellShabu" BOOLEAN NOT NULL DEFAULT false;
