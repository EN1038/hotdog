import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({
  adapter: new PrismaPg(pool, { schema: process.env.DATABASE_SCHEMA ?? "public" }),
});

async function main() {
  const branch = await prisma.branch.findFirst({
    where: { name: "คลอง 6 หน้าหมู่บ้าน" },
    select: { id: true, name: true },
  });
  if (!branch) return;

  const menus = await prisma.branchMenuItem.findMany({
    where: { branchId: branch.id, isHidden: false },
    select: {
      id: true,
      name: true,
      itemCode: true,
      sortOrder: true,
      stock: { select: { quantity: true, updatedAt: true } },
      category: { select: { name: true, stockExempt: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const saleMenus = menus.filter((m) => !m.category?.stockExempt);
  console.log(`Sale menus: ${saleMenus.length}`);
  saleMenus.forEach((m, i) => {
    const seq = i + 1;
    if (
      m.name.includes("บล็") ||
      m.name.includes("แฮม") ||
      seq === 20 ||
      seq === 26
    ) {
      console.log(
        `#${seq} ${m.name} code=${m.itemCode} stock=${m.stock?.quantity ?? "none"} updated=${m.stock?.updatedAt?.toISOString().slice(0, 10) ?? ""}`,
      );
    }
  });

  const broccoliExact = menus.filter((m) => m.name.includes("บล็"));
  console.log("\nAll broccoli-like items:");
  for (const m of broccoliExact) {
    const histories = await prisma.branchMenuItemStockHistory.findMany({
      where: { menuItemId: m.id, createdAt: { gte: new Date("2026-08-29T00:00:00+07:00") } },
      orderBy: { createdAt: "asc" },
      take: 20,
    });
    console.log(`\n${m.name} (${m.id}) stock=${m.stock?.quantity ?? 0}`);
    for (const h of histories) {
      console.log(`  ${h.createdAt.toISOString()} ${h.type} ${h.quantity} ${h.note ?? ""}`);
    }
    if (histories.length === 0) console.log("  (no history since Aug 29)");
  }

  const count = await prisma.stockCount.findUnique({
    where: { id: "cmthd7gle016e0uax9j4e2tu7" },
    select: { note: true, status: true, createdAt: true },
  });
  const note = count?.note ? JSON.parse(count.note) : {};
  console.log("\nCount status:", count?.status, count?.createdAt?.toISOString());
  console.log("Pending apply?", note.pendingAdminApply);
}

main()
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
