import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { reconstructOptionIdsFromText } from "../src/lib/order-item-options-text";

const BRANCH_ID = "cmrt2p7zg005g0v87lowgbv1r";
const BROCCOLI_ID = "cmrt2re0800ao0v87w510zjz4";
const HAM_ID = "cmrt2rdz000a30v874fnsbeit";
const COUNT_ID = "cmthd7gle016e0uax9j4e2tu7";
const DAY_START = new Date("2026-08-31T00:00:00+07:00");
const DAY_END = new Date("2026-09-01T00:00:00+07:00");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({
  adapter: new PrismaPg(pool, { schema: process.env.DATABASE_SCHEMA ?? "public" }),
});

function countNameInOptionsText(text: string | null | undefined, needle: string) {
  if (!text) return 0;
  const parts = text.split(",").map((s) => s.trim());
  let n = 0;
  for (const part of parts) {
    const base = part.split("·")[0]?.trim() ?? part;
    if (base === needle || base.includes(needle)) n++;
  }
  return n;
}

function menuGroupsForItem(
  item: {
    optionGroupLinks: Array<{
      group: {
        mode: string;
        name: string;
        options: Array<{ id: string; name: string }>;
        menuItemSources: Array<{
          isEnabled: boolean;
          menuItemId: string;
          menuItem: { name: string; isHidden: boolean } | null;
        }>;
      };
    }>;
  },
) {
  return item.optionGroupLinks.map((l) => ({
    mode: l.group.mode,
    name: l.group.name,
    options: l.group.options,
    menuItemSources: l.group.menuItemSources,
  }));
}

async function main() {
  const branch = await prisma.branch.findUnique({
    where: { id: BRANCH_ID },
    select: { name: true, brand: { select: { name: true } } },
  });
  console.log(`\n=== สาขา ${branch?.name} (${branch?.brand?.name}) ===`);
  console.log(`ช่วง: 31/08/2569 (Bangkok)\n`);

  const count = await prisma.stockCount.findUnique({ where: { id: COUNT_ID } });
  const countNote = count?.note ? JSON.parse(count.note) : {};
  console.log("สรุปยอดที่แจ้ง:");
  console.log(`  cash=${countNote.cash} transfer=${countNote.transfer} change=${countNote.change} customers=${countNote.customers}`);
  console.log(`  status=${count?.status} pendingApply=${countNote.pendingAdminApply}\n`);

  const orders = await prisma.order.findMany({
    where: {
      branchId: BRANCH_ID,
      createdAt: { gte: DAY_START, lt: DAY_END },
      status: { notIn: ["CANCELLED"] },
    },
    include: {
      items: {
        include: {
          branchMenuItem: {
            include: {
              optionGroupLinks: {
                include: {
                  group: {
                    include: {
                      options: { select: { id: true, name: true } },
                      menuItemSources: {
                        where: { isEnabled: true },
                        include: {
                          menuItem: { select: { id: true, name: true, isHidden: true } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      createdByStaff: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`=== ออเดอร์ทั้งหมดวันนี้: ${orders.length} บิล ===\n`);

  let orderCash = 0;
  let orderTransfer = 0;
  const menuNameById = new Map<string, string>();

  const allMenus = await prisma.branchMenuItem.findMany({
    where: { branchId: BRANCH_ID },
    select: { id: true, name: true },
  });
  for (const m of allMenus) menuNameById.set(m.id, m.name);

  const expectedFromText = new Map<string, number>();
  const deductedByOrder = new Map<string, Map<string, number>>();

  for (const order of orders) {
    const total = order.items.reduce((s, i) => {
      return (
        s +
        Number(i.unitPrice) * i.quantity +
        Number(i.optionsPrice) * i.quantity
      );
    }, 0);

    if (order.paymentMethod === "CASH") orderCash += total;
    else if (order.paymentMethod === "TRANSFER") orderTransfer += total;

    const hist = await prisma.branchMenuItemStockHistory.findMany({
      where: {
        branchId: BRANCH_ID,
        type: "SALE",
        note: { startsWith: `ORDER:${order.id}` },
        cancelledAt: null,
      },
      include: { menuItem: { select: { name: true } } },
    });

    const dedMap = new Map<string, number>();
    for (const h of hist) {
      dedMap.set(h.menuItemId, (dedMap.get(h.menuItemId) ?? 0) + Math.abs(h.quantity));
    }
    deductedByOrder.set(order.id, dedMap);

    let hasPromo = false;
    let hasMismatch = false;
    const lines: string[] = [];

    for (const item of order.items) {
      const menu = item.branchMenuItem;
      const isPromo = menu?.optionGroupLinks.some((l) => l.group.mode === "FROM_MENU");
      if (isPromo) hasPromo = true;

      const groups = menu ? menuGroupsForItem(menu) : [];
      const reconstructed = reconstructOptionIdsFromText(groups, item.optionsText);

      const textCounts = new Map<string, number>();
      if (item.optionsText) {
        for (const part of item.optionsText.split(",").map((s) => s.trim())) {
          const base = (part.split("·")[0] ?? part).trim();
          if (!base) continue;
          textCounts.set(base, (textCounts.get(base) ?? 0) + 1);
        }
      }

      for (const [name, qty] of textCounts) {
        const menuMatch = allMenus.find((m) => m.name === name);
        if (menuMatch) {
          expectedFromText.set(
            menuMatch.id,
            (expectedFromText.get(menuMatch.id) ?? 0) + qty * item.quantity,
          );
        }
      }

      if (isPromo && item.optionsText) {
        const brocText = countNameInOptionsText(item.optionsText, "บล็อคโคลี่");
        const brocDed = dedMap.get(BROCCOLI_ID) ?? 0;
        const hamText = countNameInOptionsText(item.optionsText, "แฮมแผ่น");
        const hamDed = dedMap.get(HAM_ID) ?? 0;

        if (brocText > 0 || hamText > 0) {
          lines.push(`    โปร "${item.itemName}" qty=${item.quantity}`);
          lines.push(`      optionsText: ${item.optionsText}`);
          lines.push(`      จากข้อความ → บล็อคโคลี่ ${brocText}, แฮมแผ่น ${hamText}`);
          lines.push(`      reconstructOptionIds → ${reconstructed.length} ids`);
          lines.push(`      ตัดสต็อกจริง → บล็อคโคลี่ ${brocDed}, แฮมแผ่น ${hamDed}`);
          if (brocText !== brocDed || hamText !== hamDed) hasMismatch = true;
        }
      } else if (item.branchMenuItemId === BROCCOLI_ID || item.branchMenuItemId === HAM_ID) {
        lines.push(`    ขายตรง "${item.itemName}" qty=${item.quantity}`);
        lines.push(`      ตัดสต็อก: ${dedMap.get(item.branchMenuItemId!) ?? 0}`);
      }
    }

    const time = order.createdAt.toISOString().slice(11, 16);
    console.log(
      `#${order.orderNumber} ${time} ${order.paymentMethod} ${total.toFixed(0)}฿ deducted=${order.stockDeducted} staff=${order.createdByStaff?.name ?? "?"}`,
    );
    if (lines.length) {
      for (const l of lines) console.log(l);
      if (hasMismatch) console.log("    ⚠ ข้อความ vs ตัดสต็อก ไม่ตรง!");
    }
  }

  console.log(`\n=== ยอดเงินจากออเดอร์ (ไม่รวม delivery/discount) ===`);
  console.log(`  Cash orders total: ${orderCash.toFixed(0)}`);
  console.log(`  Transfer orders total: ${orderTransfer.toFixed(0)}`);
  console.log(`  รวม: ${(orderCash + orderTransfer).toFixed(0)}`);
  console.log(`  สรุปยอดที่กรอก: cash=${countNote.cash} transfer=${countNote.transfer}`);

  const brocHist = await prisma.branchMenuItemStockHistory.findMany({
    where: {
      branchId: BRANCH_ID,
      menuItemId: BROCCOLI_ID,
      type: "SALE",
      createdAt: { gte: DAY_START, lt: DAY_END },
      cancelledAt: null,
    },
    orderBy: { createdAt: "asc" },
  });

  const hamHist = await prisma.branchMenuItemStockHistory.findMany({
    where: {
      branchId: BRANCH_ID,
      menuItemId: HAM_ID,
      type: "SALE",
      createdAt: { gte: DAY_START, lt: DAY_END },
      cancelledAt: null,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`\n=== สรุปบล็อคโคลี่ ===`);
  console.log(`  จาก optionsText ทุกออเดอร์: ${expectedFromText.get(BROCCOLI_ID) ?? 0} ไม้`);
  console.log(`  ตัดสต็อกจริง (SALE history): ${brocHist.reduce((s, h) => s + Math.abs(h.quantity), 0)} ไม้`);
  console.log(`  สต็อกปัจจุบัน: ${(await prisma.branchMenuItemStock.findUnique({ where: { menuItemId: BROCCOLI_ID } }))?.quantity}`);
  console.log(`  รายการตัด:`);
  for (const h of brocHist) {
    const on = h.note?.split("|")[1] ?? h.note;
    console.log(`    ${h.createdAt.toISOString().slice(11, 16)} -${Math.abs(h.quantity)} ${on}`);
  }

  console.log(`\n=== สรุปแฮมแผ่น ===`);
  let hamFromText = 0;
  for (const order of orders) {
    for (const item of order.items) {
      hamFromText += countNameInOptionsText(item.optionsText, "แฮมแผ่น") * item.quantity;
      if (item.branchMenuItemId === HAM_ID) hamFromText += item.quantity;
    }
  }
  console.log(`  จากออเดอร์ (text+direct): ${hamFromText} ไม้`);
  console.log(`  ตัดสต็อกจริง: ${hamHist.reduce((s, h) => s + Math.abs(h.quantity), 0)} ไม้`);
  console.log(`  สต็อกปัจจุบัน: ${(await prisma.branchMenuItemStock.findUnique({ where: { menuItemId: HAM_ID } }))?.quantity}`);

  const promoItem = await prisma.branchMenuItem.findFirst({
    where: { branchId: BRANCH_ID, name: { contains: "เคลียร์สต" } },
    include: {
      optionGroupLinks: {
        include: {
          group: {
            include: {
              menuItemSources: {
                where: { isEnabled: true },
                include: { menuItem: { select: { name: true } } },
              },
            },
          },
        },
      },
    },
  });

  console.log(`\n=== โปรเคลียร์สต๊อก ===`);
  for (const link of promoItem?.optionGroupLinks ?? []) {
    const g = link.group;
    console.log(`  กลุ่ม "${g.name}" mode=${g.mode} maxSelect=${(g as { maxSelect?: number }).maxSelect ?? "?"}`);
    console.log(`  ไม้ในโปร: ${g.menuItemSources.map((s) => s.menuItem?.name).join(", ")}`);
  }

  const promoOrders = orders.filter((o) =>
    o.items.some((i) => i.itemName.includes("เคลียร์สต")),
  );
  console.log(`\n  ออเดอร์โปรเคลียร์สต๊อกวันนี้: ${promoOrders.length} บิล`);
  for (const o of promoOrders) {
    const item = o.items.find((i) => i.itemName.includes("เคลียร์สต"))!;
    const sticks = item.optionsText?.split(",").length ?? 0;
    const ded = deductedByOrder.get(o.id);
    const totalDed = [...(ded?.values() ?? [])].reduce((a, b) => a + b, 0);
    console.log(`    #${o.orderNumber}: ${sticks} ไม้ในข้อความ, ตัดสต็อกรวม ${totalDed} รายการ`);
    console.log(`      ${item.optionsText}`);
  }

  const notDeducted = orders.filter((o) => !o.stockDeducted);
  console.log(`\n=== ออเดอร์ที่ stockDeducted=false: ${notDeducted.length} ===`);
  for (const o of notDeducted) {
    console.log(`  #${o.orderNumber} status=${o.status}`);
  }

  const cancelled = await prisma.order.findMany({
    where: {
      branchId: BRANCH_ID,
      createdAt: { gte: DAY_START, lt: DAY_END },
      status: "CANCELLED",
    },
    select: { orderNumber: true, cancelReason: true, createdAt: true },
  });
  console.log(`\n=== ออเดอร์ยกเลิกวันนี้: ${cancelled.length} ===`);
  for (const o of cancelled) {
    console.log(`  #${o.orderNumber} ${o.cancelReason ?? ""}`);
  }

  console.log(`\n=== สรุปความต่าง ===`);
  const openBroc = 10;
  const openHam = 20;
  const dedBroc = brocHist.reduce((s, h) => s + Math.abs(h.quantity), 0);
  const dedHam = hamHist.reduce((s, h) => s + Math.abs(h.quantity), 0);
  const countBroc = (countNote.lines ?? []).find((l: { name?: string }) => l.name?.includes("บล็อคโคลี่") && !l.name?.includes("พัน"));
  const countHam = (countNote.lines ?? []).find((l: { name?: string }) => l.name === "แฮมแผ่น");

  console.log(`บล็อคโคลี่: เปิด ${openBroc} - ตัด ${dedBroc} = ระบบ ${openBroc - dedBroc} | นับได้ ${countBroc?.countedQty} | จากข้อความออเดอร์ ${expectedFromText.get(BROCCOLI_ID) ?? 0}`);
  console.log(`แฮมแผ่น: เปิด ${openHam} - ตัด ${dedHam} = ระบบ ${openHam - dedHam} | นับได้ ${countHam?.countedQty} | จากออเดอร์ ~${hamFromText}`);
  console.log(`\nถ้าพนักงานคีย์ครบ: ควรเหลือ บล็อค ${openBroc - (expectedFromText.get(BROCCOLI_ID) ?? 0)} / แฮม ${openHam - hamFromText}`);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
