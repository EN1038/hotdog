-- Staff: one phone may belong to multiple branches
DROP INDEX IF EXISTS "Staff_phone_key";
DROP INDEX IF EXISTS "Staff_lineUserId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "Staff_branchId_phone_key" ON "Staff"("branchId", "phone");
CREATE INDEX IF NOT EXISTS "Staff_phone_idx" ON "Staff"("phone");
CREATE INDEX IF NOT EXISTS "Staff_lineUserId_idx" ON "Staff"("lineUserId");
