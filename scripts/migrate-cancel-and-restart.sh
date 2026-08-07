#!/usr/bin/env bash
# Apply cancel columns + restart Next on port 3030
set -euo pipefail
cd "$(dirname "$0")/.."

set -a
# shellcheck disable=SC1091
source .env
set +a

SCHEMA="${DATABASE_SCHEMA:-order_app}"
SCHEMA="${SCHEMA//\"/}"

echo "→ Testing DB + migrating cancel columns (schema=$SCHEMA)…"
node <<EOF
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const schema = ${JSON.stringify(SCHEMA)};
const p = new PrismaClient({
  adapter: new PrismaPg(
    { connectionString: process.env.DATABASE_URL },
    { schema },
  ),
});
(async () => {
  await p.\$queryRawUnsafe("SELECT 1");
  console.log("DB OK");
  for (const t of [
    "BranchMenuItemStockHistory",
    "BranchNonMenuItemHistory",
    "BranchShift",
  ]) {
    await p.\$executeRawUnsafe(
      'ALTER TABLE "' + schema + '"."' + t + '" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3)',
    );
    await p.\$executeRawUnsafe(
      'ALTER TABLE "' + schema + '"."' + t + '" ADD COLUMN IF NOT EXISTS "cancelNote" TEXT',
    );
    console.log("migrated", t);
  }
  await p.\$disconnect();
  console.log("DONE migrate");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
EOF

echo "→ Restarting dev server…"
exec bash ./scripts/restart-dev.sh 3030
