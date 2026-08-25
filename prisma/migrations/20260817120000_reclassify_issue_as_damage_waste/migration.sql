-- Historical branch FOH "จ่ายออก" was recorded as ISSUE but used as ของเสีย.
-- Reclassify to DAMAGE so analytics: ของเสีย = DAMAGE/LOST, จ่ายออก = ISSUE.

UPDATE "BranchMenuItemStockHistory"
SET "type" = 'DAMAGE'
WHERE "type" = 'ISSUE';

UPDATE "BranchNonMenuItemHistory"
SET "type" = 'DAMAGE'
WHERE "type" = 'ISSUE';
