import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg(
      { connectionString: process.env.DATABASE_URL },
      { schema: process.env.DATABASE_SCHEMA ?? "public" },
    ),
  });

  try {
    const branch = await prisma.branch.findFirst({
      where: { name: "คลอง 6 สะพานชมพู" },
      include: {
        optionGroups: {
          include: {
            options: true,
            menuItemLinks: { select: { menuItemId: true } },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    console.log(
      JSON.stringify(
        branch?.optionGroups.map((g) => ({
          id: g.id,
          name: g.name,
          mode: g.mode,
          required: g.required,
          minSelect: g.minSelect,
          maxSelect: g.maxSelect,
          options: g.options.map((o) => ({ id: o.id, name: o.name, priceDelta: o.priceDelta })),
          menuLinks: g.menuItemLinks.length,
        })),
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
