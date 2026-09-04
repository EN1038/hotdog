import { StaffRole } from "@prisma/client";
import { appAbsoluteUrlOrNull } from "@/lib/app-url";
import { formatPrice } from "@/lib/constants";
import { prisma } from "@/lib/db";
import {
  brandLinePushText,
  isBrandLineMessagingReady,
} from "@/lib/brand-line";
import { orderGrandTotal } from "@/lib/order-totals";
import { requestedDateToKey } from "@/lib/skewer-order";

const LINE_TEXT_MAX = 4800;

async function brandAllowsLine(
  brandId: string,
  flag: "lineNotifyNewOrder" | "lineNotifySkewerOrder",
): Promise<boolean> {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: {
      lineNotifyNewOrder: true,
      lineNotifySkewerOrder: true,
    },
  });
  if (!brand) return false;
  return flag === "lineNotifyNewOrder"
    ? brand.lineNotifyNewOrder
    : brand.lineNotifySkewerOrder;
}

async function ownerLineRecipients(brandId: string): Promise<string[]> {
  const members = await prisma.brandMember.findMany({
    where: {
      brandId,
      role: { in: ["OWNER", "MANAGER"] },
      admin: {
        lineUserId: { not: null },
        lineNotifyEnabled: true,
      },
    },
    select: { admin: { select: { lineUserId: true } } },
  });
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of members) {
    const id = m.admin.lineUserId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

async function pushMany(
  brandId: string,
  recipients: string[],
  text: string,
) {
  if (recipients.length === 0) return;
  await Promise.allSettled(
    recipients.map((id) => brandLinePushText(brandId, id, text)),
  );
}

function truncate(text: string): string {
  if (text.length <= LINE_TEXT_MAX) return text;
  return text.slice(0, LINE_TEXT_MAX - 20) + "\n…(ตัดข้อความ)";
}

export type StaffNewOrderNotifyInput = {
  id: string;
  orderNumber: string;
  queueNumber?: number | null;
  branchId: string;
  fulfillmentType: string;
  customerName: string;
  customerPhone: string;
  status: string;
};

/** Notify branch staff (SELLER) linked to this branch's LINE. */
export async function notifyStaffNewOrder(
  order: StaffNewOrderNotifyInput,
): Promise<void> {
  try {
    const branch = await prisma.branch.findUnique({
      where: { id: order.branchId },
      select: { id: true, name: true, brandId: true },
    });
    const brandId = branch?.brandId;
    if (!branch || !brandId) return;
    if (!(await isBrandLineMessagingReady(brandId))) return;
    if (!(await brandAllowsLine(brandId, "lineNotifyNewOrder"))) return;

    const staff = await prisma.staff.findMany({
      where: {
        branchId: order.branchId,
        isActive: true,
        lineNotifyEnabled: true,
        lineUserId: { not: null },
        roles: { some: { role: StaffRole.SELLER } },
      },
      select: { lineUserId: true },
    });
    if (staff.length === 0) return;

    const full = await prisma.order.findUnique({
      where: { id: order.id },
      select: {
        orderNumber: true,
        queueNumber: true,
        fulfillmentType: true,
        customerName: true,
        customerPhone: true,
        addressDetail: true,
        note: true,
        deliveryFee: true,
        discountAmount: true,
        deliveryLocation: { select: { name: true, address: true } },
        items: {
          select: {
            itemName: true,
            quantity: true,
            unitPrice: true,
            optionsPrice: true,
            optionsText: true,
          },
        },
      },
    });
    if (!full) return;

    const total = orderGrandTotal(
      full.items.map((it) => ({
        quantity: it.quantity,
        unitPrice: Number(it.unitPrice),
        optionsPrice: Number(it.optionsPrice),
      })),
      Number(full.deliveryFee),
      Number(full.discountAmount),
    );

    let addressLine: string | null = null;
    if (full.fulfillmentType === "DELIVERY") {
      const parts = [
        full.deliveryLocation?.name,
        full.deliveryLocation?.address,
        full.addressDetail?.trim(),
      ].filter(Boolean);
      addressLine = parts.length ? parts.join(" · ") : null;
    }

    const staffUrl = appAbsoluteUrlOrNull("/staff");
    const itemLines =
      full.items.length === 0
        ? ["· (ไม่มีรายการ)"]
        : full.items.map((it) => {
            const opts = it.optionsText?.trim();
            return opts
              ? `· ${it.itemName} ×${it.quantity} (${opts})`
              : `· ${it.itemName} ×${it.quantity}`;
          });

    const text = truncate(
      [
        "ออเดอร์ใหม่",
        full.queueNumber != null
          ? `คิว ${full.queueNumber} · #${full.orderNumber}`
          : `#${full.orderNumber}`,
        branch.name,
        "",
        full.fulfillmentType === "PICKUP" ? "รับที่ร้าน" : "จัดส่ง",
        `ลูกค้า: ${full.customerName.trim() || full.customerPhone || "ลูกค้า"}`,
        full.customerPhone ? `โทร: ${full.customerPhone}` : null,
        addressLine ? `ที่อยู่: ${addressLine}` : null,
        full.note ? `หมายเหตุ: ${full.note}` : null,
        "",
        "รายการ:",
        ...itemLines,
        "",
        `รวม ฿${formatPrice(total)}`,
        staffUrl ? `\nเปิดดู: ${staffUrl}` : null,
      ]
        .filter((l) => l !== null)
        .join("\n"),
    );

    await pushMany(
      brandId,
      staff.map((s) => s.lineUserId!).filter(Boolean),
      text,
    );
  } catch (error) {
    console.error("[brand-line] notifyStaffNewOrder failed", error);
  }
}

/** Notify brand owners/managers on LINE for a new customer order. */
export async function notifyBrandOwnersNewOrder(
  orderId: string,
): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        orderNumber: true,
        queueNumber: true,
        fulfillmentType: true,
        customerName: true,
        customerPhone: true,
        deliveryFee: true,
        discountAmount: true,
        branch: {
          select: { id: true, name: true, brandId: true },
        },
        items: {
          select: {
            quantity: true,
            unitPrice: true,
            optionsPrice: true,
          },
        },
      },
    });
    const brandId = order?.branch.brandId;
    if (!order || !brandId) return;
    if (!(await isBrandLineMessagingReady(brandId))) return;
    if (!(await brandAllowsLine(brandId, "lineNotifyNewOrder"))) return;

    const total = orderGrandTotal(
      order.items.map((it) => ({
        quantity: it.quantity,
        unitPrice: Number(it.unitPrice),
        optionsPrice: Number(it.optionsPrice),
      })),
      Number(order.deliveryFee),
      Number(order.discountAmount),
    );

    const staffUrl = appAbsoluteUrlOrNull("/staff");
    const text = truncate(
      [
        "ออเดอร์ลูกค้าใหม่",
        `${order.branch.name} #${order.orderNumber}`,
        order.queueNumber != null ? `คิว ${order.queueNumber}` : null,
        order.fulfillmentType === "DELIVERY" ? "จัดส่ง" : "รับที่ร้าน",
        order.customerName?.trim()
          ? `ลูกค้า ${order.customerName.trim()}`
          : null,
        order.customerPhone?.trim()
          ? `โทร ${order.customerPhone.trim()}`
          : null,
        `ยอด ${formatPrice(total)}`,
        staffUrl ? `เปิดดู: ${staffUrl}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );

    await pushMany(brandId, await ownerLineRecipients(brandId), text);
  } catch (error) {
    console.error("[brand-line] notifyBrandOwnersNewOrder failed", error);
  }
}

/** Notify brand owners/managers for a new skewer order. */
export async function notifyBrandOwnersSkewerOrder(
  skewerOrderId: string,
): Promise<void> {
  try {
    const order = await prisma.skewerOrder.findUnique({
      where: { id: skewerOrderId },
      select: {
        orderNumber: true,
        customerPhone: true,
        customerName: true,
        requestedDate: true,
        branch: {
          select: { name: true, brandId: true },
        },
        items: { select: { requestedQuantity: true } },
      },
    });
    const brandId = order?.branch.brandId;
    if (!order || !brandId) return;
    if (!(await isBrandLineMessagingReady(brandId))) return;
    if (!(await brandAllowsLine(brandId, "lineNotifySkewerOrder"))) return;

    const stickCount = order.items.reduce(
      (n, it) => n + Math.max(0, it.requestedQuantity),
      0,
    );
    const adminUrl = appAbsoluteUrlOrNull("/owner");
    const dateKey = requestedDateToKey(order.requestedDate);

    const text = truncate(
      [
        "สั่งเสียบไม้ใหม่",
        `${order.branch.name} #${order.orderNumber}`,
        order.customerName?.trim()
          ? `ลูกค้า ${order.customerName.trim()}`
          : null,
        order.customerPhone?.trim()
          ? `โทร ${order.customerPhone.trim()}`
          : null,
        `วันที่ต้องการ ${dateKey}`,
        stickCount > 0 ? `${stickCount} รายการ` : null,
        adminUrl ? `เปิดดู: ${adminUrl}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );

    await pushMany(brandId, await ownerLineRecipients(brandId), text);
  } catch (error) {
    console.error("[brand-line] notifyBrandOwnersSkewerOrder failed", error);
  }
}

export async function isBrandLineDailySummaryEnabled(
  brandId: string,
): Promise<boolean> {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { lineNotifyDailySummary: true, lineMessagingEnabled: true },
  });
  return Boolean(brand?.lineNotifyDailySummary && brand.lineMessagingEnabled);
}
