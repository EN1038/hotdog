-- Cash counted when closing a sales round (carry-forward float)
ALTER TABLE "BranchShift" ADD COLUMN IF NOT EXISTS "closingCash" DECIMAL(10, 2);
