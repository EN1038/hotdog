/**
 * Hard-delete order #L7803 and restore menu/consumable stock.
 *
 *   npx tsx scripts/delete-order-l7803.ts
 *   npx tsx scripts/delete-order-l7803.ts --apply
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { hardDeleteOrderWithStockRestore } from "../src/lib/order-hard-delete";

const ORDER_NUMBER = "L7803";
const apply = process.argv.includes("--apply");

async function main() {
  const order = await prisma.order.findUnique({
    where: { orderNumber: ORDER_NUMBER },
    include: {
      branch: { select: { id: true, name: true } },
      items: { select: { itemName: true, quantity: true, giftQuantity: true } },
      consumableLines: { select: { itemName: true, quantity: true } },
      _count: { select: { stockMovements: true } },
    },
  });

  if (!order) {
    console.log(`ไม่พบออเดอร์ #${ORDER_NUMBER}`);
    return;
  }

  console.log(`mode: ${apply ? "APPLY" : "DRY-RUN"}`);
  console.log(
    `#${order.orderNumber} id=${order.id} status=${order.status} stockDeducted=${order.stockDeducted}`,
  );
  console.log(`branch=${order.branch.name} (${order.branch.id})`);
  console.log(
    `items=${order.items.length} consumables=${order.consumableLines.length} stockMovements=${order._count.stockMovements}`,
  );
  for (const i of order.items) {
    console.log(`  - ${i.itemName} ×${i.quantity}`);
  }
  for (const c of order.consumableLines) {
    console.log(`  - [consumable] ${c.itemName} ×${c.quantity}`);
  }

  if (!apply) {
    console.log("\nRe-run with --apply to restore stock and delete this order only.");
    return;
  }

  const snapshot = await hardDeleteOrderWithStockRestore(order.id);
  console.log("\nDeleted:", snapshot);

  const gone = await prisma.order.findUnique({
    where: { id: order.id },
    select: { id: true },
  });
  console.log(gone ? "ERROR: order still exists" : "OK: order removed, stock restored");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
