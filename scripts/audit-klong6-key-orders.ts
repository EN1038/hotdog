import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({
  adapter: new PrismaPg(pool, { schema: process.env.DATABASE_SCHEMA ?? "public" }),
});

async function main() {
  const nums = ["X4872", "H5775", "U8965", "R1604", "R3693", "R9686"];
  for (const num of nums) {
    const o = await prisma.order.findFirst({
      where: { orderNumber: num },
      include: { items: true },
    });
    const total = o!.items.reduce(
      (s, i) => s + Number(i.unitPrice) * i.quantity + Number(i.optionsPrice) * i.quantity,
      0,
    );
    console.log(`\n#${num} ${o!.paymentMethod} ${total}฿`);
    for (const i of o!.items) {
      console.log(`  ${i.itemName} x${i.quantity} @${i.unitPrice}`);
      console.log(`  opts: ${i.optionsText ?? "-"}`);
    }
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
