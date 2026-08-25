import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";

/** Cryptographically unguessable public receipt token. */
export function generateOrderPublicShareToken(): string {
  return randomBytes(18).toString("base64url");
}

export function orderPublicSharePath(token: string): string {
  return `/share/o/${encodeURIComponent(token)}`;
}

/**
 * Ensure order has publicShareToken; returns absolute or path for caller to prefix with origin.
 */
export async function ensureOrderPublicShareToken(
  orderId: string,
): Promise<string> {
  const row = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, publicShareToken: true },
  });
  if (!row) throw new Error("ไม่พบออเดอร์");
  if (row.publicShareToken) return row.publicShareToken;

  for (let i = 0; i < 5; i += 1) {
    const token = generateOrderPublicShareToken();
    try {
      await prisma.order.update({
        where: { id: orderId },
        data: { publicShareToken: token },
      });
      return token;
    } catch {
      /* unique collision — retry */
    }
  }
  throw new Error("สร้างลิงก์สาธารณะไม่สำเร็จ");
}

export type PublicOrderReceipt = {
  token: string;
  orderNumber: string;
  queueNumber: number;
  status: string;
  paymentMethod: string;
  fulfillmentType: string;
  createdAt: string;
  paymentSlipUrl: string | null;
  deliveryFee: number;
  discountAmount: number;
  grandTotal: number;
  note: string | null;
  branch: {
    name: string;
    phone: string | null;
    address: string | null;
    brandName: string | null;
  };
  customerName: string | null;
  customerPhoneMasked: string | null;
  items: Array<{
    itemName: string;
    quantity: number;
    unitPrice: number;
    optionsPrice: number;
    optionsText: string | null;
    giftQuantity: number;
    note: string | null;
    lineTotal: number;
  }>;
  consumableLines: Array<{
    itemName: string;
    quantity: number;
    unit: string;
  }>;
};

function maskPhone(phone: string | null | undefined): string | null {
  const p = (phone ?? "").replace(/\D/g, "");
  if (p.length < 8) return phone?.trim() || null;
  return `${p.slice(0, 3)}-***-${p.slice(-4)}`;
}

export async function loadPublicOrderReceipt(
  token: string,
): Promise<PublicOrderReceipt | null> {
  const raw = token.trim();
  if (!raw || raw.length < 12) return null;

  const order = await prisma.order.findFirst({
    where: { publicShareToken: raw },
    include: {
      branch: {
        select: {
          name: true,
          phone: true,
          address: true,
          brand: { select: { name: true } },
        },
      },
      items: {
        select: {
          itemName: true,
          quantity: true,
          unitPrice: true,
          optionsPrice: true,
          optionsText: true,
          giftQuantity: true,
          note: true,
        },
      },
      consumableLines: {
        select: { itemName: true, quantity: true, unit: true },
      },
    },
  });
  if (!order || !order.publicShareToken) return null;

  const items = order.items.map((it) => {
    const unit = Number(it.unitPrice) + Number(it.optionsPrice);
    const lineTotal = Math.round(unit * it.quantity * 100) / 100;
    return {
      itemName: it.itemName,
      quantity: it.quantity,
      unitPrice: Number(it.unitPrice),
      optionsPrice: Number(it.optionsPrice),
      optionsText: it.optionsText,
      giftQuantity: it.giftQuantity ?? 0,
      note: it.note,
      lineTotal,
    };
  });
  const itemsSum = items.reduce((s, it) => s + it.lineTotal, 0);
  const deliveryFee = Number(order.deliveryFee);
  const discountAmount = Number(order.discountAmount);
  const grandTotal =
    Math.round((itemsSum + deliveryFee - discountAmount) * 100) / 100;

  return {
    token: order.publicShareToken,
    orderNumber: order.orderNumber,
    queueNumber: order.queueNumber,
    status: order.status,
    paymentMethod: order.paymentMethod,
    fulfillmentType: order.fulfillmentType,
    createdAt: order.createdAt.toISOString(),
    paymentSlipUrl: order.paymentSlipUrl,
    deliveryFee,
    discountAmount,
    grandTotal,
    note: order.note,
    branch: {
      name: order.branch.name,
      phone: order.branch.phone,
      address: order.branch.address,
      brandName: order.branch.brand?.name ?? null,
    },
    customerName: order.customerName?.trim() || null,
    customerPhoneMasked: maskPhone(
      order.customerPhone || null,
    ),
    items,
    consumableLines: order.consumableLines.map((c) => ({
      itemName: c.itemName,
      quantity: c.quantity,
      unit: c.unit,
    })),
  };
}
