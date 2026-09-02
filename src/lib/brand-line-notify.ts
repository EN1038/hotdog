import { appAbsoluteUrlOrNull } from "@/lib/app-url";
import { formatPrice } from "@/lib/constants";
import { prisma } from "@/lib/db";
import {
  isLineMessagingReady,
  linePushText,
} from "@/lib/line";
import { orderGrandTotal } from "@/lib/order-totals";

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

async function lineRecipientsForBrand(brandId: string): Promise<string[]> {
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

async function pushToBrandOwners(brandId: string, text: string) {
  const recipients = await lineRecipientsForBrand(brandId);
  if (recipients.length === 0) return;
  await Promise.allSettled(
    recipients.map((id) => linePushText(id, text)),
  );
}

/** Notify brand owners/managers on LINE for a new customer order. */
export async function notifyBrandOwnersNewOrder(orderId: string): Promise<void> {
  try {
    if (!(await isLineMessagingReady())) return;

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
          select: {
            id: true,
            name: true,
            brandId: true,
          },
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
    const lines = [
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
    ].filter(Boolean);

    let text = lines.join("\n");
    if (text.length > LINE_TEXT_MAX) {
      text = text.slice(0, LINE_TEXT_MAX - 20) + "\n…(ตัดข้อความ)";
    }

    await pushToBrandOwners(brandId, text);
  } catch (error) {
    console.error("[brand-line] notifyBrandOwnersNewOrder failed", error);
  }
}

/** Notify brand owners/managers on LINE for a new skewer prep order. */
export async function notifyBrandOwnersSkewerOrder(
  skewerOrderId: string,
): Promise<void> {
  try {
    if (!(await isLineMessagingReady())) return;

    const order = await prisma.skewerOrder.findUnique({
      where: { id: skewerOrderId },
      select: {
        orderNumber: true,
        customerPhone: true,
        customerName: true,
        requestedDate: true,
        branch: {
          select: {
            name: true,
            brandId: true,
          },
        },
        items: { select: { requestedQuantity: true } },
      },
    });
    const brandId = order?.branch.brandId;
    if (!order || !brandId) return;
    if (!(await brandAllowsLine(brandId, "lineNotifySkewerOrder"))) return;

    const stickCount = order.items.reduce(
      (n, it) => n + Math.max(0, it.requestedQuantity),
      0,
    );
    const adminUrl = appAbsoluteUrlOrNull("/admin");

    const lines = [
      "สั่งเสียบไม้ใหม่",
      `${order.branch.name} #${order.orderNumber}`,
      order.customerName?.trim()
        ? `ลูกค้า ${order.customerName.trim()}`
        : null,
      order.customerPhone?.trim()
        ? `โทร ${order.customerPhone.trim()}`
        : null,
      `วันที่ต้องการ ${order.requestedDate}`,
      stickCount > 0 ? `${stickCount} รายการ` : null,
      adminUrl ? `เปิดดู: ${adminUrl}` : null,
    ].filter(Boolean);

    let text = lines.join("\n");
    if (text.length > LINE_TEXT_MAX) {
      text = text.slice(0, LINE_TEXT_MAX - 20) + "\n…(ตัดข้อความ)";
    }

    await pushToBrandOwners(brandId, text);
  } catch (error) {
    console.error("[brand-line] notifyBrandOwnersSkewerOrder failed", error);
  }
}

export async function isBrandLineDailySummaryEnabled(
  brandId: string,
): Promise<boolean> {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { lineNotifyDailySummary: true },
  });
  return Boolean(brand?.lineNotifyDailySummary);
}
