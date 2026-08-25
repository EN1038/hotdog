-- Conditional option groups: show only when parent option(s) selected
ALTER TABLE "BranchOptionGroup" ADD COLUMN IF NOT EXISTS "visibleWhenOptionIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
