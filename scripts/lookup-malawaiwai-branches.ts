import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const adapter = new PrismaPg(
    { connectionString: process.env.DATABASE_URL },
    { schema: process.env.DATABASE_SCHEMA ?? "public" },
  );
  const prisma = new PrismaClient({ adapter });

  try {
    const allBrands = await prisma.brand.findMany({
      where: {
        OR: [
          { name: { contains: "ไวไว" } },
          { name: { contains: "หม่าล่า" } },
          { code: { contains: "mala" } },
        ],
      },
      select: { id: true, code: true, name: true, status: true },
      orderBy: { name: "asc" },
    });
    console.log("matching brands:", JSON.stringify(allBrands, null, 2));

    const brand = await prisma.brand.findFirst({
      where: {
        OR: [
          { code: "malawaiwai" },
          { code: "hma-la-hna-pak-sxy-phed-lin-cha" },
          { name: { contains: "หม่าล่า" } },
        ],
      },
      include: {
        branches: {
          orderBy: { name: "asc" },
          select: {
            id: true,
            code: true,
            name: true,
            kind: true,
            isTest: true,
            stockEnabled: true,
            operatingMode: true,
            _count: {
              select: {
                menuItems: true,
                staff: true,
                orders: true,
                branchMenuItemStocks: true,
                branchNonMenuItems: true,
              },
            },
          },
        },
        products: { select: { id: true } },
        stockLocations: {
          select: { id: true, type: true, name: true, branchId: true },
        },
        suppliers: { select: { id: true, name: true } },
      },
    });

    const existingDemo = await prisma.brand.findFirst({
      where: { code: "malawaiwai-demo" },
      select: { id: true, name: true },
    });

    console.log(
      JSON.stringify(
        {
          source: brand
            ? {
                id: brand.id,
                code: brand.code,
                name: brand.name,
                plan: brand.plan,
                stockEnabled: brand.stockEnabled,
                productCount: brand.products.length,
                supplierCount: brand.suppliers.length,
                stockLocations: brand.stockLocations,
                branches: brand.branches,
              }
            : null,
          existingDemo,
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
