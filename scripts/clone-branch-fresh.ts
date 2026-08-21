/**
 * Create a fresh branch by copying catalog/settings from a source branch.
 * Does NOT copy: orders, expenses, shifts, staff, stock qty (>0), sales history.
 *
 * Run:
 *   npx tsx scripts/clone-branch-fresh.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { importBranchCatalog } from "../src/lib/branch-import";
import { slugifyCode, withUniqueSuffix } from "../src/lib/slug";

const SOURCE_NAME = "นครชัยมงคลวิลล่า ซอย 2 นวนคร";
const NEW_NAME = "สต๊อกกลาง - คลอง 2 คลองหลวง";

async function main() {
  const adapter = new PrismaPg(
    { connectionString: process.env.DATABASE_URL },
    { schema: process.env.DATABASE_SCHEMA ?? "public" },
  );
  const prisma = new PrismaClient({ adapter });

  try {
    const source = await prisma.branch.findFirst({
      where: { name: SOURCE_NAME },
    });
    if (!source) throw new Error(`ไม่พบสาขาต้นทาง: ${SOURCE_NAME}`);

    const existing = await prisma.branch.findFirst({
      where: {
        brandId: source.brandId,
        name: NEW_NAME,
      },
      select: { id: true, name: true },
    });
    if (existing) {
      throw new Error(
        `มีสาขาชื่อ "${NEW_NAME}" อยู่แล้ว (id=${existing.id}) — ลบหรือเปลี่ยนชื่อก่อน`,
      );
    }

    const taken = new Set(
      (
        await prisma.branch.findMany({
          where: { brandId: source.brandId },
          select: { code: true },
        })
      )
        .map((b) => b.code)
        .filter((c): c is string => Boolean(c)),
    );
    const code = withUniqueSuffix(slugifyCode(NEW_NAME) || "cj-nwnkhr", taken);

    const created = await prisma.branch.create({
      data: {
        brandId: source.brandId,
        name: NEW_NAME,
        nameTh: NEW_NAME,
        nameEn: source.nameEn,
        code,
        imageUrl: source.imageUrl,
        // New site — leave address/phone blank for staff to fill
        address: null,
        latitude: null,
        longitude: null,
        phone: null,
        primaryCategory: source.primaryCategory,
        secondaryCategories: source.secondaryCategories,
        priceRange: source.priceRange,
        ownerMessage: source.ownerMessage,
        extraMessage: source.extraMessage,
        isOpen: true,
        isHidden: false,
        isTest: false,
        storefrontHours: source.storefrontHours ?? undefined,
        deliveryHours: source.deliveryHours ?? undefined,
        allowAdvanceOrder: source.allowAdvanceOrder,
        autoAcceptOrders: source.autoAcceptOrders,
        stockEnabled: source.stockEnabled,
        operatingMode: source.operatingMode,
        weighSalesEnabled: source.weighSalesEnabled,
        alertSoundId: source.alertSoundId,
      },
    });

    console.log("created branch", created.id, created.name, created.code);

    const imported = await importBranchCatalog({
      sourceBranchId: source.id,
      targetBranchId: created.id,
      overwriteMenu: true,
      includeLocations: true,
      includeNonMenuItems: true,
    });
    console.log("imported catalog", imported);

    // Menu stock rows at 0 (no sales history)
    const menuItems = await prisma.branchMenuItem.findMany({
      where: { branchId: created.id },
      select: { id: true },
    });
    if (menuItems.length > 0) {
      await prisma.branchMenuItemStock.createMany({
        data: menuItems.map((m) => ({
          branchId: created.id,
          menuItemId: m.id,
          quantity: 0,
        })),
        skipDuplicates: true,
      });
    }

    // Ensure consumables/equipment qty = 0
    await prisma.branchNonMenuItem.updateMany({
      where: { branchId: created.id },
      data: { quantity: 0 },
    });

    const verify = await prisma.branch.findUnique({
      where: { id: created.id },
      select: {
        id: true,
        name: true,
        code: true,
        brandId: true,
        stockEnabled: true,
        operatingMode: true,
        _count: {
          select: {
            menuItems: true,
            menuCategories: true,
            optionGroups: true,
            deliveryLocations: true,
            branchNonMenuItems: true,
            branchMenuItemStocks: true,
            orders: true,
            expenses: true,
            staff: true,
            shifts: true,
          },
        },
      },
    });

    const stockSum = await prisma.branchMenuItemStock.aggregate({
      where: { branchId: created.id },
      _sum: { quantity: true },
    });
    const nonMenuSum = await prisma.branchNonMenuItem.aggregate({
      where: { branchId: created.id },
      _sum: { quantity: true },
    });

    console.log(
      JSON.stringify(
        {
          branch: verify,
          stockQtySum: stockSum._sum.quantity ?? 0,
          nonMenuQtySum: nonMenuSum._sum.quantity ?? 0,
          note: "orders/expenses/staff/shifts = 0 (fresh)",
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
