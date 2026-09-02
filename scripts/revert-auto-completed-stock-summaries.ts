import "dotenv/config";
import { revertAllAutoAppliedNonSaleSummaries } from "@/lib/stock-count-revert";
import { prisma } from "@/lib/db";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const branchArg = process.argv.find((a) => a.startsWith("--branch="));
  const branchId = branchArg?.slice("--branch=".length);

  console.log(
    dryRun
      ? "[dry-run] ค้นหารายการที่จะย้อนกลับ…"
      : "กำลังย้อนกลับสรุปของสิ้นเปลือง/อุปกรณ์ที่ปรับอัตโนมัติ…",
  );

  const result = await revertAllAutoAppliedNonSaleSummaries({
    branchId: branchId || undefined,
    dryRun,
  });

  console.log(JSON.stringify(result, null, 2));

  if (result.errors.length > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
