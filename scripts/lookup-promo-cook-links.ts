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
    });
    if (!branch) throw new Error("branch not found");

    const promos = await prisma.branchMenuItem.findMany({
      where: {
        branchId: branch.id,
        isHidden: false,
        optionGroupLinks: { some: { group: { mode: "FROM_MENU" } } },
      },
      select: {
        name: true,
        optionGroupLinks: {
          include: { group: { select: { name: true, mode: true } } },
        },
      },
    });

    const cookGroup = await prisma.branchOptionGroup.findFirst({
      where: { branchId: branch.id, name: "ย่าง / ทอด" },
      select: { id: true },
    });

    const promoWithCook = await prisma.branchMenuItem.findMany({
      where: {
        branchId: branch.id,
        optionGroupLinks: {
          some: {
            groupId: cookGroup?.id,
          },
        },
        AND: {
          optionGroupLinks: {
            some: { group: { mode: "FROM_MENU" } },
          },
        },
      },
      select: { name: true },
    });

    console.log(
      JSON.stringify(
        {
          promos: promos.map((x) => ({
            name: x.name,
            groups: x.optionGroupLinks.map((l) => `${l.group.name} (${l.group.mode})`),
          })),
          promoWithCookGroup: promoWithCook,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
