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
    const brands = await prisma.brand.findMany({
      select: { id: true, code: true, name: true, status: true },
      orderBy: { name: "asc" },
    });

    for (const b of brands) {
      const branches = await prisma.branch.findMany({
        where: { brandId: b.id },
        select: {
          id: true,
          name: true,
          code: true,
          operatingMode: true,
          _count: { select: { menuItems: true, optionGroups: true } },
        },
        orderBy: { name: "asc" },
      });
      console.log(`--- ${b.name} (${b.code}) ---`);
      for (const br of branches) {
        console.log(
          `  ${br.name} | ${br.code} | ${br.operatingMode} | menus=${br._count.menuItems} groups=${br._count.optionGroups}`,
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
