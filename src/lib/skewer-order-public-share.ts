import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { toPublicDisplayImageUrl } from "@/lib/share-media";
import {
  formatSkewerSplitSummary,
  resolveSkewerMenuImageUrl,
  resolveSkewerOrderItemFields,
  resolveSkewerQtyUnit,
  skewerLineSubtotalBaht,
  skewerOrderUsesConfirmedQty,
  summarizeSkewerSplit,
  SKEWER_ORDER_STATUS_LABELS,
} from "@/lib/skewer-order";
import type { SkewerOrderStatus } from "@prisma/client";

/** Cryptographically unguessable public skewer receipt token (~12 chars). */
export function generateSkewerOrderPublicShareToken(): string {
  return randomBytes(9).toString("base64url");
}

/** Short public path for SMS (legacy `/share/s/...` still redirects). */
export function skewerOrderPublicSharePath(token: string): string {
  return `/s/${encodeURIComponent(token)}`;
}

/**
 * Ensure skewer order has publicShareToken; create one if missing.
 */
export async function ensureSkewerOrderPublicShareToken(
  orderId: string,
): Promise<string> {
  const row = await prisma.skewerOrder.findUnique({
    where: { id: orderId },
    select: { id: true, publicShareToken: true },
  });
  if (!row) throw new Error("ไม่พบออเดอร์");
  if (row.publicShareToken) return row.publicShareToken;

  for (let i = 0; i < 5; i += 1) {
    const token = generateSkewerOrderPublicShareToken();
    try {
      await prisma.skewerOrder.update({
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

export type PublicSkewerOrderReceipt = {
  token: string;
  orderNumber: string;
  status: SkewerOrderStatus;
  statusLabel: string;
  requestedDate: string;
  addressText: string;
  note: string | null;
  adminNote: string | null;
  cancelReason: string | null;
  confirmedAt: string | null;
  deliveredAt: string | null;
  deliveredOn: string | null;
  deliveryInfo: string | null;
  shippingCostBaht: number | null;
  itemsSubtotalBaht: number | null;
  grandTotalBaht: number | null;
  hasBilling: boolean;
  createdAt: string;
  customerName: string | null;
  customerPhoneMasked: string | null;
  branch: {
    name: string;
    phone: string | null;
    brandName: string | null;
  };
  summaryLabel: string;
  saleStickTotal: number;
  supplyItemCount: number;
  items: Array<{
    itemName: string;
    requestedQuantity: number;
    confirmedQuantity: number | null;
    quantityUnit: string;
    sticksPerUnit: number;
    countsAsSticks: boolean;
    skewerCategoryRole: "SKEWER_SALE" | "SKEWER_SUPPLY";
    imageUrl: string | null;
    unitPriceBaht: number | null;
    lineSubtotalBaht: number | null;
  }>;
};

function maskPhone(phone: string | null | undefined): string | null {
  const p = (phone ?? "").replace(/\D/g, "");
  if (p.length < 8) return phone?.trim() || null;
  return `${p.slice(0, 3)}-***-${p.slice(-4)}`;
}

function requestedDateToKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function loadPublicSkewerOrderReceipt(
  token: string,
): Promise<PublicSkewerOrderReceipt | null> {
  const raw = token.trim();
  if (!raw || raw.length < 12) return null;

  const order = await prisma.skewerOrder.findFirst({
    where: { publicShareToken: raw },
    include: {
      branch: {
        select: {
          name: true,
          phone: true,
          brand: { select: { name: true, nameTh: true } },
        },
      },
      items: {
        orderBy: { itemName: "asc" },
        include: {
          branchMenuItem: {
            select: {
              quantityUnit: true,
              sticksPerUnit: true,
              countsAsSticks: true,
              imageUrl: true,
              skewerImageUrl: true,
              category: { select: { skewerCategoryRole: true } },
            },
          },
        },
      },
    },
  });
  if (!order || !order.publicShareToken) return null;

  const items = order.items.map((item) => {
    const fields = resolveSkewerOrderItemFields(item);
    const qty = skewerOrderUsesConfirmedQty(order.status)
      ? item.confirmedQuantity ?? 0
      : item.requestedQuantity;
    const unitPriceRaw =
      item.unitPriceBaht != null ? Number(item.unitPriceBaht) : null;
    const unitPriceBaht =
      unitPriceRaw != null && Number.isFinite(unitPriceRaw) ? unitPriceRaw : null;
    const lineSubtotalBaht =
      unitPriceBaht != null
        ? skewerLineSubtotalBaht(qty, unitPriceBaht)
        : null;
    return {
      itemName: item.itemName,
      requestedQuantity: item.requestedQuantity,
      confirmedQuantity: item.confirmedQuantity,
      quantityUnit: resolveSkewerQtyUnit({
        quantityUnit: fields.quantityUnit,
      }),
      sticksPerUnit: fields.sticksPerUnit,
      countsAsSticks: fields.countsAsSticks,
      skewerCategoryRole: fields.skewerCategoryRole,
      imageUrl: toPublicDisplayImageUrl(
        resolveSkewerMenuImageUrl({
          imageUrl: item.branchMenuItem?.imageUrl,
          skewerImageUrl: item.branchMenuItem?.skewerImageUrl,
        }),
      ),
      unitPriceBaht,
      lineSubtotalBaht,
    };
  });

  const qtyForSummary = (item: (typeof items)[number]) => {
    if (skewerOrderUsesConfirmedQty(order.status)) {
      return item.confirmedQuantity ?? 0;
    }
    return item.requestedQuantity;
  };

  const split = summarizeSkewerSplit(
    items.map((item) => ({
      quantity: qtyForSummary(item),
      sticksPerUnit: item.sticksPerUnit,
      countsAsSticks: item.countsAsSticks,
      skewerCategoryRole: item.skewerCategoryRole,
      ordered: qtyForSummary(item) > 0,
    })),
  );

  const brandName =
    order.branch.brand?.nameTh?.trim() ||
    order.branch.brand?.name?.trim() ||
    null;

  const shippingCostBaht =
    order.shippingCostBaht != null ? Number(order.shippingCostBaht) : null;
  const itemsSubtotalBaht = Math.round(
    items.reduce((sum, item) => sum + (item.lineSubtotalBaht ?? 0), 0) * 100,
  ) / 100;
  const hasBilling =
    items.some((item) => item.unitPriceBaht != null) ||
    (shippingCostBaht != null && shippingCostBaht > 0);
  const grandTotalBaht = hasBilling
    ? Math.round(
        (itemsSubtotalBaht + (shippingCostBaht ?? 0)) * 100,
      ) / 100
    : null;

  return {
    token: order.publicShareToken,
    orderNumber: order.orderNumber,
    status: order.status,
    statusLabel: SKEWER_ORDER_STATUS_LABELS[order.status],
    requestedDate: requestedDateToKey(order.requestedDate),
    addressText: order.addressText,
    note: order.note,
    adminNote: order.adminNote,
    cancelReason: order.cancelReason,
    confirmedAt: order.confirmedAt?.toISOString() ?? null,
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
    deliveredOn: order.deliveredOn
      ? requestedDateToKey(order.deliveredOn)
      : null,
    deliveryInfo: order.deliveryInfo,
    shippingCostBaht,
    itemsSubtotalBaht: hasBilling ? itemsSubtotalBaht : null,
    grandTotalBaht,
    hasBilling,
    createdAt: order.createdAt.toISOString(),
    customerName: order.customerName?.trim() || null,
    customerPhoneMasked: maskPhone(order.customerPhone),
    branch: {
      name: order.branch.name,
      phone: order.branch.phone,
      brandName,
    },
    summaryLabel: formatSkewerSplitSummary({
      sale: split.sale,
      supplyItemCount: split.supplyItemCount,
    }),
    saleStickTotal: split.sale.stickTotal,
    supplyItemCount: split.supplyItemCount,
    items,
  };
}
