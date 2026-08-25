/**
 * Demo: enable cook methods on food menus (not sauces/seasonings) and re-link
 * ปิ้ง/ทอด/ชาบู + น้ำชาบู so shared options save onto every relevant line.
 *
 * Run: npx tsx scripts/apply-demo-cook-links.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const SKIP_CATEGORY =
  /น้ำจิ้ม|เครื่องปรุง|สิ้นเปลือง|ถุง|แก้ว|โปร|ของทอด/u;

async function main() {
  const adapter = new PrismaPg(
    { connectionString: process.env.DATABASE_URL },
    { schema: process.env.DATABASE_SCHEMA ?? "public" },
  );
  const prisma = new PrismaClient({ adapter });

  const branch = await prisma.branch.findFirst({
    where: {
      OR: [{ name: "สาขา ทดสอบ" }, { name: { contains: "ทดสอบ" } }],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (!branch) throw new Error("ไม่พบสาขาทดสอบ");

  const cookGroup = await prisma.branchOptionGroup.findFirst({
    where: {
      branchId: branch.id,
      name: { in: ["ปิ้ง / ทอด / ชาบู", "ปิ้ง / ทอด"] },
    },
    include: { options: true },
  });
  const shabuGroup = await prisma.branchOptionGroup.findFirst({
    where: { branchId: branch.id, name: "น้ำชาบู" },
  });
  if (!cookGroup || !shabuGroup) {
    throw new Error("missing cook/shabu groups — run seed-test-branch-cook-options.ts first");
  }

  const shabuOpt = cookGroup.options.find((o) => o.name === "ชาบู");
  if (shabuOpt) {
    await prisma.branchOptionGroup.update({
      where: { id: shabuGroup.id },
      data: { visibleWhenOptionIds: [shabuOpt.id] },
    });
  }

  const menus = await prisma.branchMenuItem.findMany({
    where: { branchId: branch.id, isHidden: false },
    select: {
      id: true,
      name: true,
      category: { select: { name: true } },
    },
  });

  let flagged = 0;
  let linked = 0;
  for (const item of menus) {
    const cat = item.category?.name ?? "";
    if (SKIP_CATEGORY.test(cat)) continue;

    await prisma.branchMenuItem.update({
      where: { id: item.id },
      data: {
        sellGrill: true,
        sellFry: true,
        sellShabu: true,
        sellPiece: true,
      },
    });
    flagged += 1;

    await prisma.branchMenuItemOptionGroup.upsert({
      where: {
        menuItemId_groupId: {
          menuItemId: item.id,
          groupId: cookGroup.id,
        },
      },
      update: {},
      create: { menuItemId: item.id, groupId: cookGroup.id },
    });
    await prisma.branchMenuItemOptionGroup.upsert({
      where: {
        menuItemId_groupId: {
          menuItemId: item.id,
          groupId: shabuGroup.id,
        },
      },
      update: {},
      create: { menuItemId: item.id, groupId: shabuGroup.id },
    });
    linked += 1;
  }

  console.log(
    JSON.stringify(
      {
        branch: branch.name,
        cookGroup: cookGroup.name,
        menusFlagged: flagged,
        menusLinkedCookShabu: linked,
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
