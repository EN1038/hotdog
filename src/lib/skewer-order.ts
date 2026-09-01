import type { SkewerOrderStatus } from "@prisma/client";
import type { StatusTone } from "@/lib/status-badge";
import {
  generateOrderNumber,
  isBangkokDateKey,
  queueBusinessDateFromKey,
} from "@/lib/constants";

export const SKEWER_MIN_QTY_PER_ITEM = 1;

export type SkewerCategoryRoleValue = "SKEWER_SALE" | "SKEWER_SUPPLY";

export const SKEWER_CATEGORY_ROLE_LABELS: Record<SkewerCategoryRoleValue, string> = {
  SKEWER_SALE: "รายการขาย",
  SKEWER_SUPPLY: "ของสิ้นเปลือง",
};

export function isSkewerSupplyRole(
  role?: string | null,
): boolean {
  return role === "SKEWER_SUPPLY";
}

export function resolveSkewerCategoryRole(item: {
  skewerCategoryRole?: string | null;
  category?: { skewerCategoryRole?: string | null } | null;
}): SkewerCategoryRoleValue {
  const raw = item.skewerCategoryRole ?? item.category?.skewerCategoryRole;
  return raw === "SKEWER_SUPPLY" ? "SKEWER_SUPPLY" : "SKEWER_SALE";
}

export function splitSkewerByRole<T extends { skewerCategoryRole?: string | null }>(
  items: T[],
): { saleItems: T[]; supplyItems: T[] } {
  const saleItems: T[] = [];
  const supplyItems: T[] = [];
  for (const item of items) {
    if (isSkewerSupplyRole(item.skewerCategoryRole)) supplyItems.push(item);
    else saleItems.push(item);
  }
  return { saleItems, supplyItems };
}

export function summarizeSkewerSplit(
  lines: Array<{
    quantity: number;
    ordered?: boolean;
    sticksPerUnit?: number | null;
    countsAsSticks?: boolean | null;
    skewerCategoryRole?: string | null;
  }>,
): {
  sale: { itemCount: number; unitTotal: number; stickTotal: number };
  supplyItemCount: number;
  supplyUnitTotal: number;
} {
  const saleLines = lines.filter((l) => !isSkewerSupplyRole(l.skewerCategoryRole));
  const supplyLines = lines.filter((l) => isSkewerSupplyRole(l.skewerCategoryRole));
  const sale = summarizeSkewerLines(saleLines);
  let supplyItemCount = 0;
  let supplyUnitTotal = 0;
  for (const line of supplyLines) {
    if (line.ordered === false) continue;
    if (line.quantity <= 0) continue;
    supplyItemCount += 1;
    supplyUnitTotal += line.quantity;
  }
  return { sale, supplyItemCount, supplyUnitTotal };
}

/** e.g. `48 ไม้ · 2 ของสิ้นเปลือง` */
export function formatSkewerSplitSummary(summary: {
  sale: { itemCount: number; stickTotal: number };
  supplyItemCount: number;
}): string {
  const parts: string[] = [];
  if (summary.sale.stickTotal > 0) {
    parts.push(`${summary.sale.stickTotal} ไม้`);
  } else if (summary.sale.itemCount > 0) {
    parts.push(`${summary.sale.itemCount} รายการขาย`);
  }
  if (summary.supplyItemCount > 0) {
    parts.push(`${summary.supplyItemCount} ของสิ้นเปลือง`);
  }
  if (parts.length === 0) return "0 รายการ";
  return parts.join(" · ");
}

/** Per-menu minimum qty in SKEWER mode; always ≥ 1. */
export function resolveSkewerMinQty(item: {
  skewerMinQty?: number | null;
}): number {
  const n = item.skewerMinQty;
  if (typeof n !== "number" || !Number.isFinite(n)) return 1;
  return Math.max(1, Math.floor(n));
}

/** Clamp qty to 0 or ≥ item minimum. */
export function normalizeSkewerOrderQty(
  qty: number,
  item: { skewerMinQty?: number | null },
): number {
  if (qty <= 0) return 0;
  const min = resolveSkewerMinQty(item);
  return qty < min ? min : qty;
}

/** Portrait frame for skewer menu photos (matches typical phone/menu shots ≈ 3:4). */
export const SKEWER_PHOTO_ASPECT = 3 / 4;
export const SKEWER_PHOTO_ASPECT_CLASS = "aspect-[3/4]";

/** Display unit for skewer quantities; empty → ไม้. */
export function resolveSkewerQtyUnit(item: {
  quantityUnit?: string | null;
}): string {
  const unit = item.quantityUnit?.trim();
  return unit || "ไม้";
}

/** How many sticks (ไม้) equal one display unit. Always ≥ 1 when counting as sticks. */
export function resolveSticksPerUnit(item: {
  sticksPerUnit?: number | null;
}): number {
  const n = item.sticksPerUnit;
  if (typeof n !== "number" || !Number.isFinite(n)) return 1;
  return Math.max(1, Math.floor(n));
}

/** Whether this menu line contributes to stick (ไม้) totals. Default true. */
export function resolveCountsAsSticks(item: {
  countsAsSticks?: boolean | null;
}): boolean {
  return item.countsAsSticks !== false;
}

export function toStickEquivalent(
  qty: number,
  item: {
    sticksPerUnit?: number | null;
    countsAsSticks?: boolean | null;
  },
): number {
  if (!resolveCountsAsSticks(item)) return 0;
  return qty * resolveSticksPerUnit(item);
}

/** e.g. `2 ชุด` or `2 ชุด (= 24 ไม้)` when counts as sticks and sticksPerUnit > 1. */
export function formatSkewerQtyLabel(
  qty: number,
  item: {
    quantityUnit?: string | null;
    sticksPerUnit?: number | null;
    countsAsSticks?: boolean | null;
  },
  opts?: { showStickEquiv?: boolean },
): string {
  const unit = resolveSkewerQtyUnit(item);
  const base = `${qty} ${unit}`;
  if (!resolveCountsAsSticks(item)) return base;
  const per = resolveSticksPerUnit(item);
  const showEquiv = opts?.showStickEquiv !== false && per > 1;
  if (!showEquiv) return base;
  return `${base} (= ${toStickEquivalent(qty, item)} ไม้)`;
}

export function summarizeSkewerLines(
  lines: Array<{
    quantity: number;
    ordered?: boolean;
    sticksPerUnit?: number | null;
    countsAsSticks?: boolean | null;
  }>,
): { itemCount: number; unitTotal: number; stickTotal: number } {
  let itemCount = 0;
  let unitTotal = 0;
  let stickTotal = 0;
  for (const line of lines) {
    if (line.ordered === false) continue;
    if (line.quantity <= 0) continue;
    itemCount += 1;
    unitTotal += line.quantity;
    stickTotal += toStickEquivalent(line.quantity, line);
  }
  return { itemCount, unitTotal, stickTotal };
}

/** Footer / summary: `3 รายการ · เทียบ 48 ไม้` (omit stick part when 0). */
export function formatSkewerDualSummary(summary: {
  itemCount: number;
  stickTotal: number;
}): string {
  if (summary.stickTotal <= 0) {
    return `${summary.itemCount} รายการ`;
  }
  return `${summary.itemCount} รายการ · เทียบ ${summary.stickTotal} ไม้`;
}

/** Prefer skewer-specific photo; fall back to normal menu image. */
export function resolveSkewerMenuImageUrl(item: {
  imageUrl?: string | null;
  skewerImageUrl?: string | null;
}): string | null {
  const skewer = item.skewerImageUrl?.trim();
  if (skewer) return skewer;
  const normal = item.imageUrl?.trim();
  return normal || null;
}

/** Unit fields for a skewer order line — prefer snapshot stored on the order item. */
export function resolveSkewerOrderItemFields(item: {
  quantityUnit?: string | null;
  sticksPerUnit?: number | null;
  countsAsSticks?: boolean | null;
  skewerCategoryRole?: string | null;
  branchMenuItem?: {
    quantityUnit?: string | null;
    sticksPerUnit?: number | null;
    countsAsSticks?: boolean | null;
    category?: { skewerCategoryRole?: string | null } | null;
  } | null;
}) {
  const menu = item.branchMenuItem;
  return {
    quantityUnit: item.quantityUnit ?? menu?.quantityUnit ?? null,
    sticksPerUnit: resolveSticksPerUnit({
      sticksPerUnit: item.sticksPerUnit ?? menu?.sticksPerUnit,
    }),
    countsAsSticks:
      item.countsAsSticks === false
        ? false
        : menu?.countsAsSticks !== false,
    skewerCategoryRole: resolveSkewerCategoryRole({
      skewerCategoryRole: item.skewerCategoryRole,
      category: menu?.category,
    }),
  };
}

/** Pick the menu thumbnail that matches the branch operating mode. */
export function resolveMenuDisplayImageUrl(
  mode: string | null | undefined,
  item: { imageUrl?: string | null; skewerImageUrl?: string | null },
): string | null {
  if (mode === "SKEWER") return resolveSkewerMenuImageUrl(item);
  const normal = item.imageUrl?.trim();
  return normal || null;
}

export const SKEWER_ORDER_STATUS_LABELS: Record<SkewerOrderStatus, string> = {
  PENDING_CONFIRM: "รอยืนยัน",
  CONFIRMED: "ยืนยันแล้ว",
  DELIVERED: "ส่งสำเร็จแล้ว",
  CANCELLED: "ยกเลิก",
};

export const SKEWER_ORDER_STATUS_TONE: Record<SkewerOrderStatus, StatusTone> = {
  PENDING_CONFIRM: "warning",
  CONFIRMED: "success",
  DELIVERED: "info",
  CANCELLED: "neutral",
};

/** Orders past admin confirm use confirmedQuantity for display. */
export function skewerOrderUsesConfirmedQty(status: SkewerOrderStatus): boolean {
  return status === "CONFIRMED" || status === "DELIVERED";
}

type SkewerMenuPriceSource = {
  price?: { toString(): string } | number | string | null;
  storefrontPrice?: { toString(): string } | number | string | null;
  pickupPrice?: { toString(): string } | number | string | null;
};

function toNonNegMoney(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Default skewer line unit price from menu channel prices. */
export function resolveSkewerMenuUnitPrice(menu: SkewerMenuPriceSource): number {
  return (
    toNonNegMoney(menu.storefrontPrice) ??
    toNonNegMoney(menu.pickupPrice) ??
    toNonNegMoney(menu.price) ??
    0
  );
}

export function skewerLineSubtotalBaht(qty: number, unitPriceBaht: number): number {
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  if (!Number.isFinite(unitPriceBaht) || unitPriceBaht < 0) return 0;
  return Math.round(qty * unitPriceBaht * 100) / 100;
}

export function parseSkewerUnitPriceInput(raw: string): number | null {
  const trimmed = raw.trim().replace(/,/g, "");
  if (!trimmed) return null;
  const n = Number.parseFloat(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export function parseRequestedDateKey(value: string): Date | null {
  const key = value.trim().slice(0, 10);
  if (!isBangkokDateKey(key)) return null;
  return queueBusinessDateFromKey(key);
}

export function requestedDateToKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function nextSkewerOrderNumber(): string {
  return `S${generateOrderNumber()}`;
}
