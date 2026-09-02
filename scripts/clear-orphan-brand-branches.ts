/**
 * Remove orphan branches (brandId null) and their staff after brand delete.
 * Usage: ALLOW_ORPHAN_BRANCH_CLEAR=1 npx tsx scripts/clear-orphan-brand-branches.ts [phone]
 */
import "dotenv/config";
import { normalizePhone } from "../src/lib/constants";
import { prisma } from "../src/lib/db";

const DRY_RUN = process.argv.includes("--dry-run");
const phoneArg = process.argv.find((a) => /^\d/.test(a));

async function main() {
  if (!DRY_RUN && process.env.ALLOW_ORPHAN_BRANCH_CLEAR !== "1") {
    throw new Error(
      "Set ALLOW_ORPHAN_BRANCH_CLEAR=1 to run (or pass --dry-run to preview)",
    );
  }

  const phone = phoneArg ? normalizePhone(phoneArg) : null;

  const orphans = await prisma.branch.findMany({
    where: { brandId: null },
    select: {
      id: true,
      code: true,
      name: true,
      phone: true,
      staff: {
        where: phone ? { phone } : undefined,
        select: { id: true, name: true, phone: true },
      },
    },
  });

  if (orphans.length === 0) {
    console.log(JSON.stringify({ result: "no_orphan_branches" }, null, 2));
    return;
  }

  const plan = { orphans, phoneFilter: phone };
  if (DRY_RUN) {
    console.log(JSON.stringify({ dryRun: true, plan }, null, 2));
    return;
  }

  for (const branch of orphans) {
    if (phone) {
      await prisma.staff.deleteMany({
        where: { branchId: branch.id, phone },
      });
    } else {
      await prisma.staff.deleteMany({ where: { branchId: branch.id } });
    }
    const remaining = await prisma.staff.count({ where: { branchId: branch.id } });
    if (remaining === 0) {
      await prisma.branch.delete({ where: { id: branch.id } });
    }
  }

  console.log(JSON.stringify({ ok: true, cleared: plan }, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
