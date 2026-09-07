/**
 * Ensure BranchIncome table exists (when prisma db push is blocked by unrelated FKs).
 *
 *   npx tsx scripts/ensure-branch-income-table.ts
 */
import "dotenv/config";
import { ensureProdSchemaCompat } from "../src/lib/schema-compat";

async function main() {
  await ensureProdSchemaCompat();
  console.log("schema-compat done (BranchIncome included)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
