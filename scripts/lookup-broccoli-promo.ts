import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({
  adapter: new PrismaPg(pool, { schema: process.env.DATABASE_SCHEMA ?? "public" }),
});

async function main() {
  const branchId = "cmrt2p7zg005g0v87lowgbv1r";
  const promo = await prisma.branchMenuItem.findFirst({
    where: { branchId, name: { contains: "เคลียร์สต" } },
    select: {
      id: true,
      name: true,
      optionGroupLinks: {
        include: {
          group: {
            include: {
              options: {
                include: { sourceMenuItem: { select: { id: true, name: true } } },
              },
            },
          },
        },
      },
    },
  });

  console.log("Promo item:", JSON.stringify(promo, null, 2));

  const broccoli = await prisma.branchMenuItem.findFirst({
    where: { branchId, name: "บล็อคโคลี่" },
    select: { id: true, brandProductId: true },
  });

  const recipe = broccoli?.brandProductId
    ? await prisma.productRecipeLine.findMany({
        where: {
          OR: [
            { parentProductId: broccoli.brandProductId },
            { componentProductId: broccoli.brandProductId },
          ],
        },
        include: {
          parent: { select: { name: true } },
          component: { select: { name: true } },
        },
      })
    : [];

  console.log("\nRecipe lines involving broccoli product:", JSON.stringify(recipe, null, 2));

  for (const num of ["H5775", "U8965", "R1604"]) {
    const order = await prisma.order.findFirst({
      where: { orderNumber: num },
      include: {
        items: {
          include: {
            branchMenuItem: {
              select: {
                name: true,
                optionGroupLinks: {
                  include: { group: { select: { mode: true, name: true } } },
                },
              },
            },
            options: true,
          },
        },
      },
    });
    console.log(`\nOrder #${num} items:`);
    for (const item of order?.items ?? []) {
      console.log(`  ${item.branchMenuItem?.name} qty=${item.quantity}`);
      console.log(`  groups:`, item.branchMenuItem?.optionGroupLinks.map((l) => l.group));
    }
  }

  const promoOrders = await prisma.order.findMany({
    where: {
      branchId,
      createdAt: { gte: new Date("2026-08-31T00:00:00+07:00") },
      items: {
        some: { branchMenuItem: { name: { contains: "เคลียร์สต" } } },
      },
    },
    select: { orderNumber: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`\nAll clear-stock promo orders today: ${promoOrders.length}`);
  for (const o of promoOrders) console.log(`  #${o.orderNumber} ${o.createdAt.toISOString()}`);
}

main()
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
