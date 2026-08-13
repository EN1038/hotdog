-- Allow NORMAL (mala) branches to also sell by weight in the same branch
ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "weighSalesEnabled" BOOLEAN NOT NULL DEFAULT false;
