import { prisma } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth";
import {
  FULFILLMENT_LABELS,
  ORDER_STATUS_LABELS,
  formatPrice,
} from "@/lib/constants";
import {
  getBranchActivityContext,
  logAdminActivity,
} from "@/lib/admin-activity";
import {
  hardDeleteOrderWithStockRestore,
  OrderHardDeleteError,
} from "@/lib/order-hard-delete";
import { formatQueueNumber } from "@/lib/order-queue-format";
import { orderGrandTotal } from "@/lib/order-totals";
import {
  LINE_POSTBACK,
  type LineReplyPayload,
} from "@/lib/line-postback";

export const LINE_DELETE_CONFIRM_TTL_MS = 5 * 60 * 1000;
export const LINE_DELETE_CONFIRM_KEYWORD = "ยืนยัน";

const DELETE_COMMAND_RE = /^ลบ\s*#?([A-Za-z]\d{4})\s*$/i;
const BARE_ORDER_RE = /^#?([A-Za-z]\d{4})$/i;
const CONFIRM_RE = /^(ยืนยัน|ยืนยันลบ|ใช่)$/i;
const EXIT_MODE_RE = /^(ยกเลิกโหมด|ออกโหมด|exit)$/i;

export type LinkedAdmin = {
  id: string;
  username: string;
  isPlatformAdmin: boolean;
  lineNotifyEnabled: boolean;
  lineNotifyDailySummary: boolean;
  linePendingDeleteOrderId: string | null;
  linePendingDeleteExpiresAt: Date | null;
  lineDeleteModeExpiresAt: Date | null;
  brandMembers: Array<{ role: string; brandId: string }>;
};

function adminSession(admin: LinkedAdmin): SessionPayload {
  const brandIds = [
    ...new Set(
      admin.brandMembers
        .filter((m) => m.role === "OWNER" || m.role === "MANAGER")
        .map((m) => m.brandId),
    ),
  ];
  return {
    type: "admin",
    adminId: admin.id,
    username: admin.username,
    isPlatformAdmin: admin.isPlatformAdmin,
    brandIds,
  };
}

function canAdminDeleteBranchOrder(
  admin: LinkedAdmin,
  brandId: string | null | undefined,
): boolean {
  if (admin.isPlatformAdmin) return true;
  if (!brandId) return false;
  return admin.brandMembers.some(
    (m) =>
      m.brandId === brandId && (m.role === "OWNER" || m.role === "MANAGER"),
  );
}

export async function findLinkedAdmin(
  lineUserId: string,
): Promise<LinkedAdmin | null> {
  return prisma.admin.findFirst({
    where: { lineUserId },
    select: {
      id: true,
      username: true,
      isPlatformAdmin: true,
      lineNotifyEnabled: true,
      lineNotifyDailySummary: true,
      linePendingDeleteOrderId: true,
      linePendingDeleteExpiresAt: true,
      lineDeleteModeExpiresAt: true,
      brandMembers: {
        select: { role: true, brandId: true },
      },
    },
  });
}

export async function clearPendingDelete(adminId: string) {
  await prisma.admin.update({
    where: { id: adminId },
    data: {
      linePendingDeleteOrderId: null,
      linePendingDeleteExpiresAt: null,
    },
  });
}

function deleteConfirmQuickReply() {
  return [
    {
      label: "ยืนยันลบ",
      data: LINE_POSTBACK.DELETE_CONFIRM,
      displayText: "ยืนยัน",
    },
    {
      label: "ยกเลิก",
      data: LINE_POSTBACK.DELETE_CANCEL,
      displayText: "ยกเลิก",
    },
  ];
}

function formatOrderPreview(order: {
  orderNumber: string;
  queueNumber: number;
  status: keyof typeof ORDER_STATUS_LABELS;
  fulfillmentType: keyof typeof FULFILLMENT_LABELS;
  customerName: string;
  customerPhone: string;
  stockDeducted: boolean;
  deliveryFee: { toString(): string } | number | string;
  discountAmount: { toString(): string } | number | string;
  branch: { name: string };
  items: Array<{
    itemName: string;
    quantity: number;
    unitPrice: { toString(): string } | number | string;
    optionsPrice: { toString(): string } | number | string;
    optionsText: string | null;
  }>;
}): string {
  const total = orderGrandTotal(
    order.items.map((it) => ({
      quantity: it.quantity,
      unitPrice: Number(it.unitPrice),
      optionsPrice: Number(it.optionsPrice ?? 0),
    })),
    Number(order.deliveryFee ?? 0),
    Number(order.discountAmount ?? 0),
  );

  const itemLines =
    order.items.length === 0
      ? ["· (ไม่มีรายการ)"]
      : order.items.map((it) => {
          const opts = it.optionsText?.trim();
          return opts
            ? `· ${it.itemName} ×${it.quantity} (${opts})`
            : `· ${it.itemName} ×${it.quantity}`;
        });

  const customer =
    order.customerName.trim() ||
    (order.customerPhone ? `ลูกค้า ${order.customerPhone}` : "ลูกค้า");

  return [
    "ยืนยันลบออเดอร์ถาวร",
    `สาขา: ${order.branch.name}`,
    `คิว ${formatQueueNumber(order.queueNumber)} · #${order.orderNumber}`,
    `สถานะ: ${ORDER_STATUS_LABELS[order.status]}`,
    `ประเภท: ${FULFILLMENT_LABELS[order.fulfillmentType]}`,
    `ลูกค้า: ${customer}`,
    order.customerPhone ? `โทร: ${order.customerPhone}` : null,
    `สต๊อก: ${order.stockDeducted ? "เคยตัด — จะคืนก่อนลบ" : "ยังไม่ตัด"}`,
    "",
    "รายการ:",
    ...itemLines,
    "",
    `รวม ฿${formatPrice(total)}`,
    "",
    "กดปุ่มด้านล่าง หรือพิมพ์ ยืนยัน",
    "กดยกเลิก / พิมพ์อย่างอื่น = ยกเลิก",
  ]
    .filter((l) => l !== null)
    .join("\n");
}

export async function startDeletePreview(
  admin: LinkedAdmin,
  orderNumber: string,
): Promise<LineReplyPayload> {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: {
      branch: { select: { id: true, name: true, brandId: true } },
      items: {
        select: {
          itemName: true,
          quantity: true,
          unitPrice: true,
          optionsPrice: true,
          optionsText: true,
        },
        orderBy: { id: "asc" },
      },
    },
  });

  if (!order) {
    return { text: `ไม่พบออเดอร์ #${orderNumber}` };
  }

  if (!canAdminDeleteBranchOrder(admin, order.branch.brandId)) {
    return { text: `ไม่มีสิทธิ์ลบออเดอร์สาขา ${order.branch.name}` };
  }

  await prisma.admin.update({
    where: { id: admin.id },
    data: {
      linePendingDeleteOrderId: order.id,
      linePendingDeleteExpiresAt: new Date(
        Date.now() + LINE_DELETE_CONFIRM_TTL_MS,
      ),
    },
  });

  return {
    text: formatOrderPreview(order),
    quickReply: deleteConfirmQuickReply(),
  };
}

export async function confirmPendingDelete(
  admin: LinkedAdmin,
): Promise<LineReplyPayload> {
  const orderId = admin.linePendingDeleteOrderId;
  const expiresAt = admin.linePendingDeleteExpiresAt;
  if (!orderId || !expiresAt || expiresAt.getTime() < Date.now()) {
    await clearPendingDelete(admin.id);
    return { text: "คำขอลบหมดอายุแล้ว\nพิมพ์ใหม่ เช่น A1048 หรือ ลบ A1048" };
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      branchId: true,
      branch: { select: { brandId: true, name: true } },
    },
  });

  if (!order) {
    await clearPendingDelete(admin.id);
    return { text: "ไม่พบออเดอร์แล้ว (อาจถูกลบไปก่อนหน้า)" };
  }

  if (!canAdminDeleteBranchOrder(admin, order.branch.brandId)) {
    await clearPendingDelete(admin.id);
    return { text: `ไม่มีสิทธิ์ลบออเดอร์สาขา ${order.branch.name}` };
  }

  try {
    const snapshot = await hardDeleteOrderWithStockRestore(order.id);
    await clearPendingDelete(admin.id);

    const ctx = await getBranchActivityContext(snapshot.branchId);
    await logAdminActivity(adminSession(admin), {
      action: "order.delete",
      summary: `ลบออเดอร์ถาวรผ่าน LINE คิว ${snapshot.queueNumber} #${snapshot.orderNumber} (${ORDER_STATUS_LABELS[snapshot.status]}) — ยืนยันผ่านแชท`,
      brandId: ctx?.brandId ?? ctx?.brand?.id ?? null,
      brandName: ctx?.brand?.name ?? null,
      branchId: snapshot.branchId,
      branchName: ctx?.name ?? null,
      entityType: "order",
      entityId: snapshot.id,
      entityName: snapshot.orderNumber,
      metadata: {
        via: "line",
        reason: "ยืนยันผ่าน LINE",
        queueNumber: snapshot.queueNumber,
        status: snapshot.status,
        stockDeducted: snapshot.stockDeducted,
        itemCount: snapshot.itemCount,
        consumableCount: snapshot.consumableCount,
      },
    });

    return {
      text: [
        "ลบออเดอร์ถาวรแล้ว",
        `คิว ${formatQueueNumber(snapshot.queueNumber)} · #${snapshot.orderNumber}`,
        ctx?.name ? `สาขา ${ctx.name}` : null,
        snapshot.stockDeducted ? "คืนสต๊อกแล้ว" : null,
      ]
        .filter(Boolean)
        .join("\n"),
    };
  } catch (err) {
    await clearPendingDelete(admin.id);
    if (err instanceof OrderHardDeleteError) {
      return { text: `ลบไม่สำเร็จ: ${err.message}` };
    }
    console.error("[line] order delete failed", err);
    return { text: "ลบไม่สำเร็จ กรุณาลองใหม่จากหน้าแอดมิน" };
  }
}

export function isDeleteModeActive(admin: LinkedAdmin): boolean {
  return (
    Boolean(admin.lineDeleteModeExpiresAt) &&
    (admin.lineDeleteModeExpiresAt?.getTime() ?? 0) >= Date.now()
  );
}

export function isPendingDeleteActive(admin: LinkedAdmin): boolean {
  return (
    Boolean(admin.linePendingDeleteOrderId) &&
    Boolean(admin.linePendingDeleteExpiresAt) &&
    (admin.linePendingDeleteExpiresAt?.getTime() ?? 0) >= Date.now()
  );
}

/**
 * Admin-only LINE hard-delete text flow.
 */
export async function tryHandleLineOrderDelete(
  lineUserId: string,
  rawText: string,
): Promise<{ handled: boolean; reply: LineReplyPayload }> {
  const text = rawText.trim();
  const deleteMatch = text.match(DELETE_COMMAND_RE);
  const admin = await findLinkedAdmin(lineUserId);

  if (deleteMatch) {
    const orderNumber = deleteMatch[1]!.toUpperCase();
    if (!admin) {
      return {
        handled: true,
        reply: {
          text:
            "คำสั่งลบออเดอร์ใช้ได้เฉพาะแอดมินที่เชื่อม LINE แล้ว\nเข้าแอดมิน → เชื่อม LINE",
        },
      };
    }
    const reply = await startDeletePreview(admin, orderNumber);
    return { handled: true, reply };
  }

  if (!admin) {
    return { handled: false, reply: { text: "" } };
  }

  if (EXIT_MODE_RE.test(text)) {
    await prisma.admin.update({
      where: { id: admin.id },
      data: {
        lineDeleteModeExpiresAt: null,
        linePendingDeleteOrderId: null,
        linePendingDeleteExpiresAt: null,
      },
    });
    return { handled: true, reply: { text: "ออกจากโหมดลบแล้ว" } };
  }

  if (isPendingDeleteActive(admin)) {
    if (CONFIRM_RE.test(text)) {
      return {
        handled: true,
        reply: await confirmPendingDelete(admin),
      };
    }
    const bareWhilePending = text.match(BARE_ORDER_RE);
    if (bareWhilePending) {
      const reply = await startDeletePreview(
        admin,
        bareWhilePending[1]!.toUpperCase(),
      );
      return { handled: true, reply };
    }
    await clearPendingDelete(admin.id);
    return {
      handled: true,
      reply: { text: "ยกเลิกการลบออเดอร์แล้ว" },
    };
  }

  if (admin.linePendingDeleteOrderId) {
    await clearPendingDelete(admin.id);
  }

  if (isDeleteModeActive(admin)) {
    const bare = text.match(BARE_ORDER_RE);
    if (bare) {
      const reply = await startDeletePreview(admin, bare[1]!.toUpperCase());
      return { handled: true, reply };
    }
    return {
      handled: true,
      reply: {
        text: "โหมดลบเปิดอยู่ — พิมพ์เลขที่ออเดอร์ เช่น A1048\nหรือพิมพ์ ยกเลิกโหมด เพื่อออก",
      },
    };
  }

  if (admin.lineDeleteModeExpiresAt) {
    await prisma.admin.update({
      where: { id: admin.id },
      data: { lineDeleteModeExpiresAt: null },
    });
  }

  return { handled: false, reply: { text: "" } };
}
