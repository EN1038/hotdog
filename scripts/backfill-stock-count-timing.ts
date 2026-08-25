/**
 * Backfill StockCount.note.timing = AFTER_CLOSE for all existing counts
 * that do not yet have a timing (ทุกสาขา).
 *
 * Dry-run: npx tsx scripts/backfill-stock-count-timing.ts
 * Apply:   npx tsx scripts/backfill-stock-count-timing.ts --apply
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  DEFAULT_STOCK_COUNT_TIMING,
  isStockCountTiming,
  STOCK_COUNT_TIMING_LABEL,
  resolveStockCountTiming,
} from "../src/lib/stock-count-timing";

const adapter = new PrismaPg(
  { connectionString: process.env.DATABASE_URL },
  { schema: process.env.DATABASE_SCHEMA ?? "public" },
);
const prisma = new PrismaClient({ adapter });

const apply = process.argv.includes("--apply");

function parseNote(note: string | null): Record<string, unknown> {
  if (!note) return {};
  try {
    const data = JSON.parse(note) as unknown;
    return data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function withTimingInName(name: string, timingLabel: string): string {
  if (
    name.includes("ก่อนเปิด") ||
    name.includes("หลังปิด") ||
    name.includes("รีเช็ค")
  ) {
    return name;
  }
  // สรุปยอด… · เมนูขาย · รอบที่… → สรุปยอด… · หลังปิด · เมนูขาย · รอบที่…
  const parts = name.split(" · ");
  if (parts.length >= 2) {
    parts.splice(1, 0, timingLabel);
    return parts.join(" · ");
  }
  return `${name} · ${timingLabel}`;
}

async function main() {
  const rows = await prisma.stockCount.findMany({
    select: { id: true, name: true, note: true, branchId: true },
    orderBy: { createdAt: "asc" },
  });

  let needUpdate = 0;
  let skipped = 0;

  for (const row of rows) {
    const note = parseNote(row.note);
    if (isStockCountTiming(note.timing)) {
      skipped += 1;
      continue;
    }
    needUpdate += 1;
    const timing = resolveStockCountTiming({
      timing: note.timing,
      name: row.name,
    });
    // Force legacy unspecified → AFTER_CLOSE (user request)
    const nextTiming =
      timing === DEFAULT_STOCK_COUNT_TIMING || !isStockCountTiming(note.timing)
        ? DEFAULT_STOCK_COUNT_TIMING
        : timing;
    const timingLabel = STOCK_COUNT_TIMING_LABEL[nextTiming];
    const nextNote = {
      ...note,
      timing: nextTiming,
    };
    const nextName = withTimingInName(row.name, timingLabel);

    if (!apply) {
      if (needUpdate <= 5) {
        console.log(`[dry] ${row.id} · ${row.name} → timing=${nextTiming}`);
      }
      continue;
    }

    await prisma.stockCount.update({
      where: { id: row.id },
      data: {
        note: JSON.stringify(nextNote),
        name: nextName,
      },
    });
  }

  console.log(
    apply
      ? `Updated ${needUpdate} stock counts (skipped ${skipped} already timed).`
      : `Would update ${needUpdate} stock counts (skipped ${skipped}). Re-run with --apply to write.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
