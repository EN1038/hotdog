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
    const brand = await prisma.brand.findFirst({
      where: { code: "malawaiwai-demo" },
      include: {
        branches: {
          orderBy: { name: "asc" },
          select: {
            id: true,
            code: true,
            name: true,
            kind: true,
            isTest: true,
            _count: {
              select: {
                menuItems: true,
                staff: true,
                branchMenuItemStocks: true,
                orders: true,
              },
            },
            staff: {
              select: { phone: true, name: true, phoneVerifiedAt: true },
            },
          },
        },
        products: { select: { id: true } },
        members: {
          include: {
            admin: { select: { id: true, username: true, phone: true } },
          },
        },
      },
    });
    console.log(JSON.stringify(brand, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main();
