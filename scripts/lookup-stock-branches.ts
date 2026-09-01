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
      where: {
        OR: [
          { code: "malawaiwai-demo" },
          { code: "hma-la-hna-pak-sxy-phed-lin-cha" },
          { name: { contains: "หม่าล่า" } },
        ],
      },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    });

    const stockPattern =
      /สต[็๊]?อก|stock|คลัง|กลาง|warehouse|stok/i;

    for (const brand of brands) {
      const branches = await prisma.branch.findMany({
        where: { brandId: brand.id },
        select: {
          id: true,
          code: true,
          name: true,
          kind: true,
          isTest: true,
          operatingMode: true,
          createdAt: true,
          _count: {
            select: {
              menuItems: true,
              staff: true,
              orders: true,
              branchMenuItemStocks: true,
            },
          },
        },
        orderBy: { name: "asc" },
      });

      const stockLike = branches.filter(
        (b) =>
          stockPattern.test(b.name) ||
          stockPattern.test(b.code ?? "") ||
          b.kind === "WAREHOUSE",
      );

      console.log(`\n=== ${brand.name} (${brand.code}) ===`);
      console.log(`สาขาทั้งหมด: ${branches.length}`);
      console.log(`ชื่อคล้ายสต็อก/คลัง: ${stockLike.length}`);

      if (stockLike.length > 0) {
        console.log("\n--- สาขาที่ชื่อคล้ายสต็อก ---");
        for (const b of stockLike) {
          console.log(
            JSON.stringify(
              {
                id: b.id,
                name: b.name,
                code: b.code,
                kind: b.kind,
                isTest: b.isTest,
                operatingMode: b.operatingMode,
                createdAt: b.createdAt.toISOString().slice(0, 10),
                counts: b._count,
              },
              null,
              2,
            ),
          );
        }
      }

      // pairwise similar names
      const pairs: Array<[string, string]> = [];
      for (let i = 0; i < stockLike.length; i++) {
        for (let j = i + 1; j < stockLike.length; j++) {
          const a = stockLike[i]!.name;
          const b = stockLike[j]!.name;
          if (
            a.includes("สต") &&
            b.includes("สต") &&
            (a.includes(b.slice(0, 8)) ||
              b.includes(a.slice(0, 8)) ||
              a.replace(/\s/g, "") === b.replace(/\s/g, ""))
          ) {
            pairs.push([a, b]);
          }
        }
      }
      if (pairs.length > 0) {
        console.log("\n--- ชื่อที่อาจซ้ำ/คล้ายกัน ---");
        for (const [a, b] of pairs) console.log(`  • "${a}" ↔ "${b}"`);
      }

      console.log("\n--- รายชื่อสาขาทั้งหมด ---");
      for (const b of branches) {
        console.log(
          `  [${b.kind}]${b.isTest ? " test" : ""} ${b.name} (${b.code})`,
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
