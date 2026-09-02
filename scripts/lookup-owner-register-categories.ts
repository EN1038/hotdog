import "dotenv/config";
import { listOwnerRegisterCategories } from "../src/lib/owner-register-category";
import { prisma } from "../src/lib/db";

async function main() {
  const cats = await listOwnerRegisterCategories();
  console.log(JSON.stringify(cats, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
