/**
 * Link ย่าง / ทอด to promo pack menu items (FROM_MENU) on both production brands.
 *
 * Run: npx tsx scripts/apply-grill-fry-promo-links.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const BRAND_CODES = ["hmala-echaphraya", "hma-la-hna-pak-sxy-phed-lin-cha"] as const;

const EXCLUDED_BRANCH_NAMES = new Set([
  "สั่งเสียบไม้",
  "สต็อกสาขากลาง",
  "สต๊อกกลาง",
  "สต็อกกลาง",
]);

const COOK_GROUP_ALIASES = [
  "ย่าง / ทอด",
  "ปิ้ง / ทอด",
  "ปิ้ง / ทอด / ชาบู",
  "ย่าง / ทอด / ชาบู",
];

function shouldExcludeBranch(name: string): boolean {
  if (EXCLUDED_BRANCH_NAMES.has(name.trim())) return true;
  if (name.trim().startsWith("สั่งเสียบไม้")) return true;
  return false;
}

async function main() {
  const adapter = new PrismaPg(
    { connectionString: process.env.DATABASE_URL },
    { schema: process.env.DATABASE_SCHEMA ?? "public" },
  );
  const prisma = new PrismaClient({ adapter });

  const summary: Array<Record<string, unknown>> = [];

  try {
    const brands = await prisma.brand.findMany({
      where: { code: { in: [...BRAND_CODES] } },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    });

    for (const brand of brands) {
      const branches = await prisma.branch.findMany({
        where: { brandId: brand.id },
        select: { id: true, name: true, operatingMode: true },
        orderBy: { name: "asc" },
      });

      for (const branch of branches) {
        if (shouldExcludeBranch(branch.name)) {
          summary.push({
            brand: brand.name,
            branch: branch.name,
            skipped: true,
            reason: "excluded by name",
          });
          continue;
        }

        if (branch.operatingMode !== "NORMAL") {
          summary.push({
            brand: brand.name,
            branch: branch.name,
            skipped: true,
            reason: `operatingMode=${branch.operatingMode}`,
          });
          continue;
        }

        const cookGroup = await prisma.branchOptionGroup.findFirst({
          where: {
            branchId: branch.id,
            name: { in: [...COOK_GROUP_ALIASES] },
          },
          select: { id: true, name: true },
        });

        if (!cookGroup) {
          summary.push({
            brand: brand.name,
            branch: branch.name,
            skipped: true,
            reason: "missing cook group — run apply-grill-fry-options-all-brands.ts first",
          });
          continue;
        }

        const promos = await prisma.branchMenuItem.findMany({
          where: {
            branchId: branch.id,
            isHidden: false,
            optionGroupLinks: {
              some: { group: { mode: "FROM_MENU" } },
            },
          },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        });

        let linked = 0;
        for (const item of promos) {
          await prisma.branchMenuItem.update({
            where: { id: item.id },
            data: {
              sellGrill: true,
              sellFry: true,
              sellPiece: true,
            },
          });

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
          linked += 1;
        }

        summary.push({
          brand: brand.name,
          branch: branch.name,
          cookGroup: cookGroup.name,
          promoMenus: promos.map((p) => p.name),
          promosLinked: linked,
        });
      }
    }

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
