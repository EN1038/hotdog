import { prisma } from "@/lib/db";
import { bangkokDateKey } from "@/lib/constants";
import { isBranchStockActive } from "@/lib/stock";
import {
  allocateInboundLayers,
  classifyAgingLevel,
  DEFAULT_STOCK_AGING_CRITICAL_DAYS,
  DEFAULT_STOCK_AGING_WARN_DAYS,
  INBOUND_TYPES,
  summarizeAgingItems,
  type StockAgingItem,
  type StockAgingSummary,
} from "@/lib/stock-aging";

export type ShopAgingAttentionItem = {
  id: string;
  branchId: string;
  branchName: string;
  name: string;
  quantity: number;
  valueBaht: number;
  ageDays: number | null;
  level: "critical" | "warn";
};

export type ShopAgingAttention = {
  stockActive: boolean;
  warnDays: number;
  criticalDays: number;
  critical: number;
  warn: number;
  criticalQty: number;
  warnQty: number;
  attentionCount: number;
  criticalValueBaht: number;
  warnValueBaht: number;
  /** รายการแดง/ส้ม สำหรับหน้าละเอียด */
  items?: ShopAgingAttentionItem[];
};

function emptyAging(): ShopAgingAttention {
  return {
    stockActive: false,
    warnDays: DEFAULT_STOCK_AGING_WARN_DAYS,
    criticalDays: DEFAULT_STOCK_AGING_CRITICAL_DAYS,
    critical: 0,
    warn: 0,
    criticalQty: 0,
    warnQty: 0,
    attentionCount: 0,
    criticalValueBaht: 0,
    warnValueBaht: 0,
    items: [],
  };
}

function sanitizeThreshold(value: unknown, fallback: number) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(30, Math.floor(n));
}

/**
 * Compact aging attention for shop overview (owner multi-branch / staff).
 * Uses inbound history layers (same FIFO leftover idea as staff aging page).
 */
export async function loadShopAgingAttention(
  branchIds: string[],
): Promise<ShopAgingAttention> {
  if (branchIds.length === 0) return emptyAging();

  const branches = await prisma.branch.findMany({
    where: { id: { in: branchIds } },
    select: {
      id: true,
      name: true,
      stockEnabled: true,
      brandId: true,
      brand: {
        select: {
          stockEnabled: true,
        },
      },
    },
  });

  // Optional aging thresholds — fall back if column missing on older DBs
  let brandThresholds: Map<
    string,
    { warn: number | null; critical: number | null }
  > = new Map();
  try {
    const withAging = await prisma.branch.findMany({
      where: { id: { in: branchIds } },
      select: {
        id: true,
        brand: {
          select: {
            stockAgingWarnDays: true,
            stockAgingCriticalDays: true,
          },
        },
      },
    });
    brandThresholds = new Map(
      withAging.map((b) => [
        b.id,
        {
          warn: b.brand?.stockAgingWarnDays ?? null,
          critical: b.brand?.stockAgingCriticalDays ?? null,
        },
      ]),
    );
  } catch {
    /* ignore */
  }

  const active = branches.filter((b) =>
    isBranchStockActive({
      brandId: b.brandId,
      brandStockEnabled: b.brand?.stockEnabled,
      branchStockEnabled: b.stockEnabled,
    }),
  );
  if (active.length === 0) return emptyAging();

  let warnDays = DEFAULT_STOCK_AGING_WARN_DAYS;
  let criticalDays = DEFAULT_STOCK_AGING_CRITICAL_DAYS;
  const firstThresholds = brandThresholds.get(active[0]!.id);
  if (firstThresholds) {
    warnDays = sanitizeThreshold(
      firstThresholds.warn,
      DEFAULT_STOCK_AGING_WARN_DAYS,
    );
    criticalDays = Math.max(
      warnDays,
      sanitizeThreshold(
        firstThresholds.critical,
        DEFAULT_STOCK_AGING_CRITICAL_DAYS,
      ),
    );
  }

  const todayKey = bangkokDateKey();
  const items: Array<StockAgingItem & { branchId: string; branchName: string }> =
    [];

  for (const branch of active) {
    const menuItems = await prisma.branchMenuItem.findMany({
      where: { branchId: branch.id, isHidden: false },
      select: {
        id: true,
        name: true,
        price: true,
        category: { select: { stockExempt: true } },
        stock: { select: { quantity: true } },
        optionGroupLinks: {
          select: { group: { select: { mode: true } } },
        },
      },
    });

    const tracked = menuItems.filter((item) => {
      const isPromo = item.optionGroupLinks.some(
        (l) => l.group.mode === "FROM_MENU",
      );
      if (isPromo || item.category?.stockExempt) return false;
      return Math.max(0, Number(item.stock?.quantity ?? 0)) > 0;
    });
    if (tracked.length === 0) continue;

    const menuIds = tracked.map((m) => m.id);
    const historyByMenu = new Map<
      string,
      Array<{ createdAt: Date; quantity: number }>
    >();

    try {
      const history = await prisma.branchMenuItemStockHistory.findMany({
        where: {
          branchId: branch.id,
          menuItemId: { in: menuIds },
          type: { in: [...INBOUND_TYPES] },
          cancelledAt: null,
          quantity: { gt: 0 },
        },
        select: {
          menuItemId: true,
          createdAt: true,
          quantity: true,
        },
        orderBy: { createdAt: "desc" },
        take: 4000,
      });
      for (const row of history) {
        const list = historyByMenu.get(row.menuItemId) ?? [];
        list.push({ createdAt: row.createdAt, quantity: row.quantity });
        historyByMenu.set(row.menuItemId, list);
      }
    } catch {
      /* schema compat — skip history */
    }

    for (const item of tracked) {
      const quantity = Math.max(0, Number(item.stock?.quantity ?? 0));
      if (quantity <= 0) continue;
      const unitPrice = Number(item.price ?? 0);
      const allocated = allocateInboundLayers({
        currentQty: quantity,
        inbounds: historyByMenu.get(item.id) ?? [],
        todayKey,
      });
      const ageDays =
        allocated.unknownQty > 0 && allocated.layers.length === 0
          ? null
          : allocated.ageDays;
      const level = classifyAgingLevel(
        ageDays,
        allocated.daysToExpiry,
        warnDays,
        criticalDays,
      );
      items.push({
        id: `${branch.id}:${item.id}`,
        branchId: branch.id,
        branchName: branch.name,
        name: item.name,
        quantity,
        unitPrice,
        valueBaht: Math.round(quantity * unitPrice * 100) / 100,
        ageDays,
        oldestReceivedAt: allocated.oldestReceivedAt,
        lastReceivedAt: allocated.lastReceivedAt,
        expiresAt: allocated.expiresAt,
        daysToExpiry: allocated.daysToExpiry,
        level,
        source: "history",
        layers: allocated.layers,
      });
    }
  }

  const summary: StockAgingSummary = summarizeAgingItems(items);
  let criticalValueBaht = 0;
  let warnValueBaht = 0;
  for (const item of items) {
    if (item.level === "critical") criticalValueBaht += item.valueBaht;
    if (item.level === "warn") warnValueBaht += item.valueBaht;
  }

  const attentionItems: ShopAgingAttentionItem[] = items
    .filter(
      (item): item is typeof item & { level: "critical" | "warn" } =>
        item.level === "critical" || item.level === "warn",
    )
    .sort((a, b) => {
      if (a.level !== b.level) {
        return a.level === "critical" ? -1 : 1;
      }
      return (b.ageDays ?? 0) - (a.ageDays ?? 0) || b.valueBaht - a.valueBaht;
    })
    .slice(0, 80)
    .map((item) => ({
      id: item.id,
      branchId: item.branchId,
      branchName: item.branchName,
      name: item.name,
      quantity: item.quantity,
      valueBaht: item.valueBaht,
      ageDays: item.ageDays,
      level: item.level,
    }));

  return {
    stockActive: true,
    warnDays,
    criticalDays,
    critical: summary.critical,
    warn: summary.warn,
    criticalQty: summary.criticalQty,
    warnQty: summary.warnQty,
    attentionCount: summary.critical + summary.warn,
    criticalValueBaht: Math.round(criticalValueBaht * 100) / 100,
    warnValueBaht: Math.round(warnValueBaht * 100) / 100,
    items: attentionItems,
  };
}
