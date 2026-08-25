/**
 * Seed สาขาทดสอบ: เปิดสต๊อก + ใส่ยอดคงเหลือ + ประวัติรับเข้าอายุต่างกัน
 * เพื่อลองหน้า /staff/stock/aging
 *
 * Run: npx tsx scripts/seed-test-branch-aging-stock.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { bangkokDateKey, startOfBangkokDayFromKey } from "../src/lib/constants";
import { setBrandStockEnabled } from "../src/lib/stock";

function daysAgoKey(days: number) {
  const d = new Date(`${bangkokDateKey()}T12:00:00+07:00`);
  d.setDate(d.getDate() - days);
  return bangkokDateKey(d);
}

async function main() {
  const branch = await prisma.branch.findFirst({
    where: {
      OR: [
        { name: "สาขา ทดสอบ" },
        { name: { contains: "ทดสอบ" } },
        { isTest: true },
      ],
      kind: { not: "WAREHOUSE" },
    },
    select: {
      id: true,
      name: true,
      brandId: true,
      stockEnabled: true,
      brand: {
        select: {
          id: true,
          name: true,
          stockEnabled: true,
          stockAgingWarnDays: true,
          stockAgingCriticalDays: true,
        },
      },
    },
    orderBy: [{ isTest: "desc" }, { name: "asc" }],
  });

  if (!branch?.brandId || !branch.brand) {
    throw new Error("ไม่พบสาขาทดสอบ");
  }

  console.log("branch", branch.id, branch.name);
  console.log("brand", branch.brand.id, branch.brand.name);

  await prisma.brand.update({
    where: { id: branch.brandId },
    data: {
      stockAgingWarnDays: 3,
      stockAgingCriticalDays: 5,
    },
  });

  if (!branch.brand.stockEnabled) {
    await setBrandStockEnabled({ brandId: branch.brandId, enabled: true });
    console.log("enabled brand stock");
  }

  await prisma.branch.update({
    where: { id: branch.id },
    data: { stockEnabled: true },
  });
  console.log("enabled branch stock");

  type Tracked = {
    id: string;
    name: string;
    brandProductId: string | null;
    price: unknown;
    category: { stockExempt: boolean } | null;
    optionGroupLinks: Array<{ group: { mode: string } }>;
    stock: { quantity: number } | null;
  };

  let tracked: Tracked[] = await prisma.branchMenuItem.findMany({
    where: {
      branchId: branch.id,
      isHidden: false,
      brandProductId: { not: null },
    },
    select: {
      id: true,
      name: true,
      brandProductId: true,
      price: true,
      category: { select: { stockExempt: true } },
      optionGroupLinks: { select: { group: { select: { mode: true } } } },
      stock: { select: { quantity: true } },
    },
    orderBy: { name: "asc" },
    take: 40,
  });

  tracked = tracked.filter((item) => {
    const isPromo = item.optionGroupLinks.some(
      (l) => l.group.mode === "FROM_MENU",
    );
    return !isPromo && !item.category?.stockExempt;
  });

  if (tracked.length < 6) {
    const unlinked = await prisma.branchMenuItem.findMany({
      where: {
        branchId: branch.id,
        isHidden: false,
        brandProductId: null,
      },
      select: { id: true, name: true, price: true },
      orderBy: { name: "asc" },
      take: 12,
    });

    for (const item of unlinked) {
      let product = await prisma.brandProduct.findFirst({
        where: { brandId: branch.brandId, name: item.name },
        select: { id: true },
      });
      if (!product) {
        product = await prisma.brandProduct.create({
          data: {
            brandId: branch.brandId,
            name: item.name,
            unit: "รายการ",
            stockType: "SALE_ITEM",
            trackStock: true,
            sellingPrice: item.price,
          },
          select: { id: true },
        });
      }
      await prisma.branchMenuItem.update({
        where: { id: item.id },
        data: { brandProductId: product.id },
      });
      tracked.push({
        id: item.id,
        name: item.name,
        brandProductId: product.id,
        price: item.price,
        category: null,
        optionGroupLinks: [],
        stock: null,
      });
    }
  }

  if (tracked.length === 0) {
    throw new Error("ไม่มีเมนูขายให้ใส่สต๊อก — สร้างเมนูในสาขาทดสอบก่อน");
  }

  const samples = tracked.slice(0, Math.min(9, tracked.length));
  const plans = samples.map((item, i) => {
    if (i % 3 === 0) {
      return {
        item,
        qty: 8 + (i % 4),
        ageDays: 5,
        shelfDays: 2 as number | null,
      };
    }
    if (i % 3 === 1) {
      return {
        item,
        qty: 12 + (i % 5),
        ageDays: 3,
        shelfDays: 4 as number | null,
      };
    }
    return {
      item,
      qty: 20 + i,
      ageDays: 0,
      shelfDays: 5 as number | null,
    };
  });

  let staff = await prisma.staff.findFirst({
    where: { branchId: branch.id },
    select: { id: true },
  });
  if (!staff) {
    staff = await prisma.staff.create({
      data: {
        branchId: branch.id,
        name: "พนักงานทดสอบ",
        phone: `08${String(Date.now()).slice(-8)}`,
        role: "CASHIER",
      },
      select: { id: true },
    });
  }

  for (const plan of plans) {
    const receiveKey = daysAgoKey(plan.ageDays);
    const receiveAt = startOfBangkokDayFromKey(receiveKey);
    let expiresAt: Date | null = null;
    if (plan.shelfDays != null) {
      const d = new Date(`${receiveKey}T12:00:00+07:00`);
      d.setDate(d.getDate() + plan.shelfDays);
      expiresAt = startOfBangkokDayFromKey(bangkokDateKey(d));
    }

    await prisma.branchMenuItemStock.upsert({
      where: { menuItemId: plan.item.id },
      create: {
        branchId: branch.id,
        menuItemId: plan.item.id,
        quantity: plan.qty,
      },
      update: { quantity: plan.qty },
    });

    await prisma.branchMenuItem.update({
      where: { id: plan.item.id },
      data: {
        isOutOfStock: false,
        defaultShelfLifeDays: plan.shelfDays,
      },
    });

    await prisma.branchMenuItemStockHistory.deleteMany({
      where: {
        branchId: branch.id,
        menuItemId: plan.item.id,
        type: { in: ["STOCK_IN", "RESTOCK"] },
        note: { contains: "seed-aging" },
      },
    });

    await prisma.branchMenuItemStockHistory.create({
      data: {
        branchId: branch.id,
        menuItemId: plan.item.id,
        quantity: plan.qty,
        type: "STOCK_IN",
        note: `seed-aging age=${plan.ageDays}`,
        receivedAt: receiveAt,
        expiresAt,
        createdByStaffId: staff.id,
        createdAt: receiveAt,
      },
    });

    console.log(
      `• ${plan.item.name}: qty=${plan.qty} age=${plan.ageDays}d exp=${expiresAt ? bangkokDateKey(expiresAt) : "-"}`,
    );
  }

  const brandAfter = await prisma.brand.findUnique({
    where: { id: branch.brandId },
    select: {
      stockEnabled: true,
      stockAgingWarnDays: true,
      stockAgingCriticalDays: true,
    },
  });
  const branchAfter = await prisma.branch.findUnique({
    where: { id: branch.id },
    select: { stockEnabled: true, name: true },
  });

  console.log("done", {
    brand: brandAfter,
    branch: branchAfter,
    seeded: plans.length,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
