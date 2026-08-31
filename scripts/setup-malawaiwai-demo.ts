/**
 * Rebuild demo brand "หม่าล่า ไวไว - Demo" from production brand data.
 *
 * Copies menu, images, stock, par, sales (orders/shifts), expenses, and plans.
 * Creates fresh login accounts (owner / manager / per-branch staff).
 *
 * Run:
 *   ALLOW_MALAWAIWAI_DEMO_SETUP=1 npx tsx scripts/setup-malawaiwai-demo.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import {
  MALAWAIWAI_DEMO_BRANCHES,
  MALAWAIWAI_DEMO_BRAND_CODE,
  MALAWAIWAI_DEMO_PASSWORD,
  MALAWAIWAI_DEMO_STORE_BRANCHES,
  setupMalawaiwaiDemo,
} from "../src/lib/malawaiwai-demo-setup";
import { formatThaiPhone } from "../src/lib/constants";

async function main() {
  if (process.env.ALLOW_MALAWAIWAI_DEMO_SETUP !== "1") {
    throw new Error(
      "ตั้ง ALLOW_MALAWAIWAI_DEMO_SETUP=1 ก่อนรัน (จะลบและสร้างแบรนด์ demo ใหม่ทั้งหมด)",
    );
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  const prisma = new PrismaClient({
    adapter: new PrismaPg(pool, {
      schema: process.env.DATABASE_SCHEMA ?? "public",
      disposeExternalPool: false,
    }),
  });

  try {
    console.log("กำลังสร้างแบรนด์ demo จากหม่าล่า ไว ไว …");
    const result = await setupMalawaiwaiDemo(prisma);

    console.log("\n=== สำเร็จ ===");
    console.log(`แบรนด์: ${result.brandCode}`);
    console.log(`URL ลูกค้า: /${result.brandCode}`);
    console.log(`URL เจ้าของ: /owner/login`);
    console.log(`URL พนักงาน: /staff/login`);
    console.log(`รหัสผ่าน admin (เจ้าของ/ผู้จัดการ): ${result.password}`);
    console.log("\nบัญชีเจ้าของแบรนด์ (OWNER):");
    console.log(`  เบอร์/ไอดี: ${formatThaiPhone(result.ownerPhone)}`);
    console.log("\nบัญชีเห็นทุกสาขา (MANAGER):");
    console.log(`  เบอร์/ไอดี: ${formatThaiPhone(result.managerPhone)}`);
    console.log("\nพนักงานหน้าร้าน (OTP ข้าม — ยืนยันเบอร์แล้ว):");
    for (const branch of result.branches) {
      if (!branch.staffPhone) continue;
      const spec = MALAWAIWAI_DEMO_STORE_BRANCHES.find(
        (b) => b.demoCode === branch.demoCode,
      );
      console.log(
        `  ${formatThaiPhone(branch.staffPhone)} → ${branch.demoName} (${branch.demoCode})`,
      );
      console.log(
        `    orders=${branch.stats.orders} counts=${branch.stats.stockCounts} stockHist=${branch.stats.stockHistories} waste/sale in hist`,
      );
      if (spec) {
        console.log(`    จากสาขา id=${spec.sourceBranchId}`);
      }
    }
    console.log("\nสาขาเพิ่ม (เจ้าของ/ผู้จัดการ):");
    for (const branch of result.branches) {
      if (branch.staffPhone) continue;
      console.log(
        `  ${branch.demoName} (${branch.demoCode}) — skewer=${branch.stats.skewerOrders}`,
      );
    }
    console.log(
      `\nสต๊อกกลาง: balances=${result.warehouseStats.warehouseBalances} movements=${result.warehouseStats.stockMovements}`,
    );
    console.log("\nJSON summary:");
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
