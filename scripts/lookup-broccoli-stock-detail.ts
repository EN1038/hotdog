import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const branchName = "คลอง 6 หน้าหมู่บ้าน";
const countId = "cmthd7gle016e0uax9j4e2tu7";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool, {
  schema: process.env.DATABASE_SCHEMA ?? "public",
});
const prisma = new PrismaClient({ adapter });

function parseNote(note: string | null) {
  if (!note) return {};
  try {
    return JSON.parse(note) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function main() {
  const branch = await prisma.branch.findFirst({
    where: { name: branchName },
    select: { id: true, name: true, brand: { select: { name: true } } },
  });
  if (!branch) {
    console.log("Branch not found");
    return;
  }

  const count = await prisma.stockCount.findUnique({
    where: { id: countId },
    include: {
      createdByStaff: { select: { name: true } },
      shift: true,
    },
  });

  const note = parseNote(count?.note ?? null) as {
    lines?: Array<{ name?: string; systemQty?: number; countedQty?: number; seq?: number }>;
  };

  console.log("=== Latest mismatch summary ===");
  console.log(JSON.stringify({ branch: branch.name, count: count?.name, staff: count?.createdByStaff?.name, completedAt: count?.completedAt }, null, 2));

  const diffLines = (note.lines ?? []).filter(
    (l) => Number(l.systemQty) !== Number(l.countedQty),
  );
  console.log("\n=== Lines with mismatch ===");
  for (const l of diffLines) {
    console.log(
      `  #${l.seq} ${l.name}: system=${l.systemQty} counted=${l.countedQty} delta=${Number(l.countedQty) - Number(l.systemQty)}`,
    );
  }

  const broccoliMenu = await prisma.branchMenuItem.findFirst({
    where: {
      branchId: branch.id,
      OR: [{ name: { contains: "บล็" } }, { name: { contains: "โคลี่" } }],
    },
    select: {
      id: true,
      name: true,
      itemCode: true,
      stock: { select: { quantity: true, updatedAt: true } },
    },
  });

  const hamMenu = await prisma.branchMenuItem.findFirst({
    where: {
      branchId: branch.id,
      OR: [{ name: { contains: "แฮมแผ่น" } }, { name: { contains: "แฮม" } }],
    },
    select: { id: true, name: true, itemCode: true, stock: { select: { quantity: true } } },
  });

  console.log("\n=== Current menu stock ===");
  console.log(JSON.stringify({ broccoli: broccoliMenu, ham: hamMenu }, null, 2));

  if (broccoliMenu) {
    const histories = await prisma.branchMenuItemStockHistory.findMany({
      where: {
        branchId: branch.id,
        menuItemId: broccoliMenu.id,
        createdAt: {
          gte: new Date("2026-08-30T00:00:00+07:00"),
        },
      },
      orderBy: { createdAt: "asc" },
      include: { createdByStaff: { select: { name: true } } },
    });

    console.log(`\n=== Broccoli stock history since Aug 30 ===`);
    for (const h of histories) {
      console.log(
        `${h.createdAt.toISOString()} | ${h.type.padEnd(8)} | qty=${String(h.quantity).padStart(3)} | ${h.note ?? ""} | ${h.createdByStaff?.name ?? ""}${h.cancelledAt ? " [CANCELLED]" : ""}`,
      );
    }

    const saleQty = histories
      .filter((h) => h.type === "SALE" && !h.cancelledAt)
      .reduce((s, h) => s + Math.abs(h.quantity), 0);
    const adjustQty = histories
      .filter((h) => h.type === "ADJUST" && !h.cancelledAt)
      .reduce((s, h) => s + h.quantity, 0);

    console.log(`\nSale deductions total: ${saleQty}`);
    console.log(`Adjust net: ${adjustQty}`);
    console.log(`Expected from 10 - sales: ${10 - saleQty} (if started at 10)`);

    const orderItems = await prisma.orderItem.findMany({
      where: {
        branchMenuItemId: broccoliMenu.id,
        order: {
          branchId: branch.id,
          createdAt: { gte: new Date("2026-08-31T00:00:00+07:00") },
          status: { notIn: ["CANCELLED"] },
        },
      },
      include: {
        order: {
          select: {
            orderNumber: true,
            status: true,
            createdAt: true,
            source: true,
          },
        },
      },
      orderBy: { order: { createdAt: "asc" } },
    });

    console.log(`\n=== Orders with broccoli today (Aug 31) ===`);
    let orderTotal = 0;
    for (const o of orderItems) {
      orderTotal += o.quantity;
      console.log(
        `  ${o.order.createdAt.toISOString().slice(11, 16)} #${o.order.orderNumber} qty=${o.quantity} status=${o.order.status} source=${o.order.source ?? ""}`,
      );
    }
    console.log(`Order item qty total: ${orderTotal}`);

    const tableLines = await prisma.tableSessionLine.findMany({
      where: {
        branchMenuItemId: broccoliMenu.id,
        createdAt: { gte: new Date("2026-08-31T00:00:00+07:00") },
        session: { branchId: branch.id },
      },
      include: {
        session: { select: { tableLabel: true, status: true, closedAt: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    console.log(`\n=== Table session lines with broccoli today ===`);
    let tableTotal = 0;
    for (const l of tableLines) {
      tableTotal += l.quantity;
      console.log(
        `  ${l.createdAt.toISOString().slice(11, 16)} qty=${l.quantity} table=${l.session.tableLabel} session=${l.session.status}`,
      );
    }
    console.log(`Table line qty total: ${tableTotal}`);
  }

  if (hamMenu) {
    const hamHistories = await prisma.branchMenuItemStockHistory.findMany({
      where: {
        branchId: branch.id,
        menuItemId: hamMenu.id,
        createdAt: { gte: new Date("2026-08-31T00:00:00+07:00") },
      },
      orderBy: { createdAt: "asc" },
      include: { createdByStaff: { select: { name: true } } },
    });
    console.log(`\n=== Ham stock history today ===`);
    for (const h of hamHistories) {
      console.log(
        `${h.createdAt.toISOString()} | ${h.type} | qty=${h.quantity} | ${h.note ?? ""}`,
      );
    }
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
