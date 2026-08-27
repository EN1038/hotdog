/**
 * Fix skewer order items from the old "ชุด" era:
 * - Convert requestedQuantity to ไม้ where qty < min (e.g. 1 ชุด → 12 ไม้)
 * - Snapshot unit fields on each order line
 *
 *   npx tsx scripts/backfill-skewer-order-item-units.ts
 *   npx tsx scripts/backfill-skewer-order-item-units.ts --apply
 */
import { config } from "dotenv";
config({ path: ".env.local", override: true });
config({ path: ".env" });

import { BranchOperatingMode } from "@prisma/client";
import { prisma } from "../src/lib/db";

const APPLY = process.argv.includes("--apply");
const LEGACY_SET_STICKS = 12;

async function main() {
  const items = await prisma.skewerOrderItem.findMany({
    where: {
      skewerOrder: {
        branch: { operatingMode: BranchOperatingMode.SKEWER },
      },
    },
    select: {
      id: true,
      itemName: true,
      requestedQuantity: true,
      confirmedQuantity: true,
      quantityUnit: true,
      sticksPerUnit: true,
      countsAsSticks: true,
      skewerOrder: {
        select: {
          orderNumber: true,
          status: true,
        },
      },
      branchMenuItem: {
        select: {
          quantityUnit: true,
          sticksPerUnit: true,
          countsAsSticks: true,
          skewerMinQty: true,
          category: { select: { name: true, skewerCategoryRole: true } },
        },
      },
    },
    orderBy: [{ skewerOrderId: "asc" }, { itemName: "asc" }],
  });

  const plans: Array<{
    id: string;
    label: string;
    requestedQuantity: number;
    confirmedQuantity: number | null;
    quantityUnit: string | null;
    sticksPerUnit: number;
    countsAsSticks: boolean;
  }> = [];

  for (const item of items) {
    const menu = item.branchMenuItem;
    const isSupply = menu?.category?.skewerCategoryRole === "SKEWER_SUPPLY";
    const minQty = menu?.skewerMinQty ?? 1;
    const quantityUnit = menu?.quantityUnit ?? null;
    const sticksPerUnit = menu?.sticksPerUnit ?? 1;
    const countsAsSticks = menu?.countsAsSticks !== false;

    let requestedQuantity = item.requestedQuantity;
    let confirmedQuantity = item.confirmedQuantity;

    if (
      !isSupply &&
      requestedQuantity > 0 &&
      requestedQuantity < minQty &&
      minQty >= LEGACY_SET_STICKS
    ) {
      requestedQuantity *= LEGACY_SET_STICKS;
      if (confirmedQuantity != null && confirmedQuantity > 0) {
        confirmedQuantity *= LEGACY_SET_STICKS;
      }
    }

    const changed =
      requestedQuantity !== item.requestedQuantity ||
      confirmedQuantity !== item.confirmedQuantity ||
      item.quantityUnit !== quantityUnit ||
      item.sticksPerUnit !== sticksPerUnit ||
      item.countsAsSticks !== countsAsSticks;

    if (!changed) continue;

    plans.push({
      id: item.id,
      label: `#${item.skewerOrder.orderNumber} · ${item.itemName}`,
      requestedQuantity,
      confirmedQuantity,
      quantityUnit,
      sticksPerUnit,
      countsAsSticks,
    });
  }

  console.log(`Skewer order lines: ${items.length} · need update: ${plans.length}`);
  for (const row of plans.slice(0, 40)) {
    console.log(
      `- ${row.label} → สั่ง ${row.requestedQuantity} (${row.quantityUnit ?? "ไม้"})`,
    );
  }
  if (plans.length > 40) {
    console.log(`  …and ${plans.length - 40} more`);
  }

  if (!APPLY) {
    console.log("Dry run only. Re-run with --apply to write.");
    return;
  }

  let updated = 0;
  for (const row of plans) {
    await prisma.skewerOrderItem.update({
      where: { id: row.id },
      data: {
        requestedQuantity: row.requestedQuantity,
        confirmedQuantity: row.confirmedQuantity,
        quantityUnit: row.quantityUnit,
        sticksPerUnit: row.sticksPerUnit,
        countsAsSticks: row.countsAsSticks,
      },
    });
    updated += 1;
  }
  console.log(`Updated ${updated} order lines.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
