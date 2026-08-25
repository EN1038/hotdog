/**
 * Wire conditional options on สาขา ทดสอบ:
 * - ปิ้ง / ทอด / ชาบู (required)
 * - น้ำชาบู (ใส/ดำ) only when ชาบู is selected
 *
 * Run: npx tsx scripts/seed-test-branch-cook-options.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const COOK_GROUP = "ปิ้ง / ทอด / ชาบู";
const COOK_GROUP_ALIASES = ["ปิ้ง / ทอด", "ปิ้ง / ทอด / ชาบู"];
const SHABU_GROUP = "น้ำชาบู";

async function main() {
  const adapter = new PrismaPg(
    { connectionString: process.env.DATABASE_URL },
    { schema: process.env.DATABASE_SCHEMA ?? "public" },
  );
  const prisma = new PrismaClient({ adapter });

  try {
    const schema = (process.env.DATABASE_SCHEMA ?? "public").replace(/"/g, "");
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "${schema}"."BranchOptionGroup" ADD COLUMN IF NOT EXISTS "visibleWhenOptionIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`,
    );

    const branch = await prisma.branch.findFirst({
      where: {
        OR: [{ name: "สาขา ทดสอบ" }, { name: { contains: "ทดสอบ" } }],
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    });
    if (!branch) throw new Error("ไม่พบสาขาทดสอบ");
    console.log("branch:", branch.name, branch.id);

    const maxSort = await prisma.branchOptionGroup.aggregate({
      where: { branchId: branch.id },
      _max: { sortOrder: true },
    });
    let nextSort = (maxSort._max.sortOrder ?? 0) + 1;

    let cookGroup = await prisma.branchOptionGroup.findFirst({
      where: {
        branchId: branch.id,
        name: { in: COOK_GROUP_ALIASES },
      },
      include: { options: true },
    });

    if (!cookGroup) {
      cookGroup = await prisma.branchOptionGroup.create({
        data: {
          branchId: branch.id,
          name: COOK_GROUP,
          required: true,
          minSelect: 1,
          maxSelect: 1,
          sortOrder: nextSort++,
          mode: "MANUAL",
          options: {
            create: [
              { name: "ปิ้ง", priceDelta: 0 },
              { name: "ทอด (แป้ง+น้ำมัน)", priceDelta: 10 },
              { name: "ชาบู", priceDelta: 0 },
            ],
          },
        },
        include: { options: true },
      });
      console.log("created cook group");
    } else {
      await prisma.branchOptionGroup.update({
        where: { id: cookGroup.id },
        data: {
          name: COOK_GROUP,
          required: true,
          minSelect: 1,
          maxSelect: 1,
        },
      });
      for (const o of [
        { name: "ปิ้ง", priceDelta: 0 },
        { name: "ทอด (แป้ง+น้ำมัน)", priceDelta: 10 },
        { name: "ชาบู", priceDelta: 0 },
      ]) {
        const existing = cookGroup.options.find((x) => x.name === o.name);
        if (existing) {
          await prisma.branchOption.update({
            where: { id: existing.id },
            data: { priceDelta: o.priceDelta },
          });
        } else {
          await prisma.branchOption.create({
            data: {
              groupId: cookGroup.id,
              name: o.name,
              priceDelta: o.priceDelta,
            },
          });
        }
      }
      cookGroup = await prisma.branchOptionGroup.findUniqueOrThrow({
        where: { id: cookGroup.id },
        include: { options: true },
      });
      console.log("updated cook group");
    }

    const shabuCookOption = cookGroup.options.find((o) => o.name === "ชาบู");
    if (!shabuCookOption) throw new Error("missing ชาบู option");

    let shabuGroup = await prisma.branchOptionGroup.findFirst({
      where: { branchId: branch.id, name: SHABU_GROUP },
      include: { options: true },
    });

    if (!shabuGroup) {
      shabuGroup = await prisma.branchOptionGroup.create({
        data: {
          branchId: branch.id,
          name: SHABU_GROUP,
          required: true,
          minSelect: 1,
          maxSelect: 1,
          sortOrder: nextSort++,
          mode: "MANUAL",
          visibleWhenOptionIds: [shabuCookOption.id],
          options: {
            create: [
              { name: "น้ำใส", priceDelta: 0 },
              { name: "น้ำดำ", priceDelta: 0 },
            ],
          },
        },
        include: { options: true },
      });
      console.log("created shabu group");
    } else {
      await prisma.branchOptionGroup.update({
        where: { id: shabuGroup.id },
        data: {
          required: true,
          minSelect: 1,
          maxSelect: 1,
          visibleWhenOptionIds: [shabuCookOption.id],
        },
      });
      for (const o of [
        { name: "น้ำใส", priceDelta: 0 },
        { name: "น้ำดำ", priceDelta: 0 },
      ]) {
        const existing = shabuGroup.options.find((x) => x.name === o.name);
        if (existing) {
          await prisma.branchOption.update({
            where: { id: existing.id },
            data: { priceDelta: o.priceDelta },
          });
        } else {
          await prisma.branchOption.create({
            data: {
              groupId: shabuGroup.id,
              name: o.name,
              priceDelta: o.priceDelta,
            },
          });
        }
      }
      shabuGroup = await prisma.branchOptionGroup.findUniqueOrThrow({
        where: { id: shabuGroup.id },
        include: { options: true },
      });
      console.log("updated shabu group");
    }

    const menus = await prisma.branchMenuItem.findMany({
      where: {
        branchId: branch.id,
        isHidden: false,
        OR: [{ sellGrill: true }, { sellFry: true }, { sellShabu: true }],
      },
      select: { id: true },
    });

    let links = 0;
    for (const item of menus) {
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
      links += 1;
    }

    console.log(
      JSON.stringify(
        {
          cookOptions: cookGroup.options.map((o) => o.name),
          shabuVisibleWhen: shabuCookOption.name,
          shabuVisibleWhenOptionId: shabuCookOption.id,
          menusLinked: links,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
