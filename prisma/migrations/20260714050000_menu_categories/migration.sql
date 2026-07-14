-- Menu categories (global) + template option groups
-- Safe transition from BranchMenuItem.category (text) → categoryId

CREATE TABLE IF NOT EXISTS "MenuCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MenuCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MenuCategory_name_key" ON "MenuCategory"("name");

CREATE TABLE IF NOT EXISTS "CategoryOptionGroup" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "maxSelect" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CategoryOptionGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CategoryOption" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceDelta" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CategoryOption_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'BranchMenuItem' AND column_name = 'categoryId'
  ) THEN
    ALTER TABLE "BranchMenuItem" ADD COLUMN "categoryId" TEXT;
  END IF;
END $$;

-- Backfill categories from legacy string column if present
DO $$
DECLARE
  r RECORD;
  new_id TEXT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'BranchMenuItem' AND column_name = 'category'
  ) THEN
    FOR r IN
      SELECT DISTINCT trim(category) AS name
      FROM "BranchMenuItem"
      WHERE category IS NOT NULL AND trim(category) <> ''
    LOOP
      SELECT id INTO new_id FROM "MenuCategory" WHERE name = r.name;
      IF new_id IS NULL THEN
        new_id := 'cat_' || substr(md5(random()::text || clock_timestamp()::text), 1, 24);
        INSERT INTO "MenuCategory" ("id", "name", "sortOrder", "createdAt")
        VALUES (new_id, r.name, 0, CURRENT_TIMESTAMP);
      END IF;
      UPDATE "BranchMenuItem" b
      SET "categoryId" = new_id
      WHERE b.category IS NOT NULL
        AND trim(b.category) = r.name
        AND b."categoryId" IS NULL;
    END LOOP;

    ALTER TABLE "BranchMenuItem" DROP COLUMN IF EXISTS "category";
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BranchMenuItem_categoryId_fkey'
  ) THEN
    ALTER TABLE "BranchMenuItem"
      ADD CONSTRAINT "BranchMenuItem_categoryId_fkey"
      FOREIGN KEY ("categoryId") REFERENCES "MenuCategory"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CategoryOptionGroup_categoryId_fkey'
  ) THEN
    ALTER TABLE "CategoryOptionGroup"
      ADD CONSTRAINT "CategoryOptionGroup_categoryId_fkey"
      FOREIGN KEY ("categoryId") REFERENCES "MenuCategory"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CategoryOption_groupId_fkey'
  ) THEN
    ALTER TABLE "CategoryOption"
      ADD CONSTRAINT "CategoryOption_groupId_fkey"
      FOREIGN KEY ("groupId") REFERENCES "CategoryOptionGroup"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
