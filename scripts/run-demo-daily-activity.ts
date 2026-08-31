/**
 * Manually run demo activity simulation.
 *
 * Tick (default — same as cron):
 *   MALAWAIWAI_DEMO_DAILY_ENABLED=1 npx tsx scripts/run-demo-daily-activity.ts
 *
 * Batch backfill whole day:
 *   MALAWAIWAI_DEMO_DAILY_ENABLED=1 npx tsx scripts/run-demo-daily-activity.ts --batch
 *   MALAWAIWAI_DEMO_DAILY_ENABLED=1 npx tsx scripts/run-demo-daily-activity.ts --batch --force
 *   MALAWAIWAI_DEMO_DAILY_ENABLED=1 npx tsx scripts/run-demo-daily-activity.ts --batch --date=2026-08-31
 */
import "dotenv/config";
import {
  isDemoDailyActivityEnabled,
  runDemoActivityTick,
  runDemoDailyActivityBatch,
} from "../src/lib/malawaiwai-demo-daily";

async function main() {
  if (!isDemoDailyActivityEnabled()) {
    throw new Error("ตั้ง MALAWAIWAI_DEMO_DAILY_ENABLED=1 ก่อนรัน");
  }

  const batch = process.argv.includes("--batch");
  const force = process.argv.includes("--force");
  const dateArg = process.argv.find((a) => a.startsWith("--date="));
  const dateKey = dateArg?.split("=")[1]?.trim();

  console.log(
    batch
      ? "กำลังจำลอง Demo ทั้งวัน (batch) …"
      : "กำลังจำลอง Demo tick (drip) …",
  );

  const result = batch
    ? await runDemoDailyActivityBatch({ dateKey, skipIfRan: !force })
    : await runDemoActivityTick({ dateKey });

  console.log(JSON.stringify(result, null, 2));
  for (const b of result.branches) {
    if (b.skipped) {
      console.log(
        `  ⏭ ${b.branchName} — ข้าม (${b.phase ?? "skipped"})`,
      );
    } else if (b.error) {
      console.log(`  ✗ ${b.branchName} — ${b.error}`);
    } else {
      console.log(
        `  ✓ ${b.branchName} [${b.phase ?? result.mode}] — orders=${b.orders} menuIn=${b.stockIns} exp=${b.expenses} waste=${b.wasteEvents} · สิ้นเปลือง +${b.consumableStockIns ?? 0}/-${b.consumableIssues ?? 0} อุปกรณ์ +${b.equipmentStockIns ?? 0}${b.shiftOpened ? " · เปิดรอบ" : ""}${b.shiftClosed ? " · ปิดรอบ" : ""}`,
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
