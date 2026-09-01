import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool, {
  schema: process.env.DATABASE_SCHEMA ?? "public",
});
const prisma = new PrismaClient({ adapter });

function parseNote(note: string | null) {
  if (!note) return {};
  try {
    return JSON.parse(note) as {
      lines?: Array<{
        name?: string;
        systemQty?: number;
        countedQty?: number;
        seq?: number;
      }>;
    };
  } catch {
    return {};
  }
}

async function main() {
  const today = new Date();
  const bangkokToday = today.toLocaleDateString("en-CA", {
    timeZone: "Asia/Bangkok",
  });
  const yesterday = new Date(today.getTime() - 86400000).toLocaleDateString(
    "en-CA",
    { timeZone: "Asia/Bangkok" },
  );

  console.log(`Bangkok today: ${bangkokToday}, yesterday: ${yesterday}\n`);

  const menuItems = await prisma.branchMenuItem.findMany({
    where: {
      OR: [
        { name: { contains: "บล็อก" } },
        { name: { contains: "broccoli", mode: "insensitive" } },
        { itemCode: "26" },
      ],
    },
    select: {
      id: true,
      name: true,
      itemCode: true,
      branchId: true,
      branch: { select: { id: true, name: true, code: true, brand: { select: { name: true, code: true } } } },
      stock: { select: { quantity: true, updatedAt: true } },
    },
    orderBy: [{ branch: { name: "asc" } }, { name: "asc" }],
  });

  console.log(`=== Menu items matching broccoli / code 26: ${menuItems.length} ===`);
  for (const item of menuItems) {
    console.log(
      JSON.stringify(
        {
          branch: item.branch.name,
          brand: item.branch.brand?.name,
          itemCode: item.itemCode,
          name: item.name,
          currentStock: item.stock?.quantity ?? 0,
          stockUpdatedAt: item.stock?.updatedAt?.toISOString() ?? null,
        },
        null,
        2,
      ),
    );
  }

  const recentCounts = await prisma.stockCount.findMany({
    where: {
      OR: [
        { name: { contains: "สรุปยอดสต๊อก" } },
        { name: { contains: "สรุปยอดขาย" } },
      ],
      createdAt: {
        gte: new Date(Date.now() - 3 * 86400000),
      },
    },
    include: {
      branch: { select: { name: true, code: true, brand: { select: { name: true } } } },
      createdByStaff: { select: { name: true } },
      shift: { select: { roundNumber: true, openedAt: true, closedAt: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  type Match = {
    countId: string;
    countName: string;
    branch: string;
    brand: string | undefined;
    staff: string | undefined;
    completedAt: string;
    broccoliLine: { seq?: number; systemQty: number; countedQty: number };
    hamLine?: { seq?: number; systemQty: number; countedQty: number };
  };

  const matches: Match[] = [];
  for (const c of recentCounts) {
    const note = parseNote(c.note);
    const lines = note.lines ?? [];
    const broccoli = lines.find(
      (l) =>
        (l.name?.includes("บล็อก") ?? false) ||
        l.seq === 26,
    );
    if (!broccoli) continue;
    const ham = lines.find(
      (l) => (l.name?.includes("แฮม") ?? false) || l.seq === 20,
    );
    matches.push({
      countId: c.id,
      countName: c.name,
      branch: c.branch.name,
      brand: c.branch.brand?.name,
      staff: c.createdByStaff?.name ?? undefined,
      completedAt: (c.completedAt ?? c.createdAt).toISOString(),
      broccoliLine: {
        seq: broccoli.seq,
        systemQty: Number(broccoli.systemQty) || 0,
        countedQty: Number(broccoli.countedQty) || 0,
      },
      hamLine: ham
        ? {
            seq: ham.seq,
            systemQty: Number(ham.systemQty) || 0,
            countedQty: Number(ham.countedQty) || 0,
          }
        : undefined,
    });
  }

  console.log(`\n=== Recent stock summaries with broccoli: ${matches.length} ===`);
  for (const m of matches.slice(0, 15)) {
    console.log(JSON.stringify(m, null, 2));
  }

  if (matches.length > 0) {
    const target = matches[0]!;
    const branchItem = menuItems.find(
      (i) => i.branch.name === target.branch && i.name.includes("บล็อก"),
    );
    if (branchItem) {
      const histories = await prisma.branchMenuItemStockHistory.findMany({
        where: {
          branchId: branchItem.branchId,
          menuItemId: branchItem.id,
          createdAt: { gte: new Date(Date.now() - 3 * 86400000) },
        },
        orderBy: { createdAt: "asc" },
        include: {
          createdByStaff: { select: { name: true } },
        },
      });

      console.log(`\n=== Stock history for ${target.branch} / ${branchItem.name} (last 3 days) ===`);
      let running = null as number | null;
      for (const h of histories) {
        console.log(
          JSON.stringify(
            {
              at: h.createdAt.toISOString(),
              type: h.type,
              quantity: h.quantity,
              note: h.note,
              staff: h.createdByStaff?.name ?? null,
              cancelledAt: h.cancelledAt?.toISOString() ?? null,
            },
            null,
            2,
          ),
        );
      }

      const saleHistories = histories.filter((h) => h.type === "SALE" && !h.cancelledAt);
      const saleTotal = saleHistories.reduce((s, h) => s + Math.abs(h.quantity), 0);
      console.log(`\nTotal SALE deductions (3 days): ${saleTotal}`);

      const orders = await prisma.orderItem.findMany({
        where: {
          branchMenuItemId: branchItem.id,
          order: {
            branchId: branchItem.branchId,
            createdAt: { gte: new Date(Date.now() - 3 * 86400000) },
            status: { notIn: ["CANCELLED"] },
          },
        },
        include: {
          order: {
            select: {
              orderNumber: true,
              status: true,
              createdAt: true,
            },
          },
        },
        orderBy: { order: { createdAt: "asc" } },
      });

      const orderQty = orders.reduce((s, o) => s + o.quantity, 0);
      console.log(`\n=== Order items sold (3 days): ${orders.length} lines, qty ${orderQty} ===`);
      for (const o of orders) {
        console.log(
          `  ${o.order.createdAt.toISOString().slice(0, 16)} #${o.order.orderNumber} qty=${o.quantity} status=${o.order.status}`,
        );
      }
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
