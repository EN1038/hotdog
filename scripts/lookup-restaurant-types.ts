import "dotenv/config";
import { prisma } from "../src/lib/db";

async function main() {
  const rows = await prisma.restaurantType.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      code: true,
      name: true,
      isActive: true,
      showInOwnerRegister: true,
      sortOrder: true,
    },
  });
  console.log(JSON.stringify(rows, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
