import { requireStaff } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { bangkokDateKey } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { isBranchStockActive } from "@/lib/stock";
import { resolveSellPrice } from "@/lib/menu-pricing";
import {
  ageDaysFromIso,
  allocateInboundLayers,
  bangkokDayDiff,
  classifyAgingLevel,
  DEFAULT_STOCK_AGING_CRITICAL_DAYS,
  DEFAULT_STOCK_AGING_WARN_DAYS,
  INBOUND_TYPES,
  levelSortRank,
  summarizeAgingItems,
  type StockAgingItem,
  type StockAgingLayer,
} from "@/lib/stock-aging";

function parseDays(raw: string | null, fallback: number) {
  // Number(null) === 0 — must not treat missing query as 0 days
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(30, Math.floor(n));
}

function sanitizeThreshold(value: unknown, fallback: number) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(30, Math.floor(n));
}

/** GET — รายการสต๊อกขายพร้อมอายุค้าง (จากล็อตหรือประวัติรับเข้า) */
export async function GET(request: Request) {
  try {
    const { ensureProdSchemaCompat } = await import("@/lib/schema-compat");
    void ensureProdSchemaCompat();

    const session = await requireStaff();
    const url = new URL(request.url);
    const includeOk = url.searchParams.get("includeOk") === "1";

    let branch: {
      id: string;
      name: string;
      brandId: string | null;
      stockEnabled: boolean;
      brand: {
        stockEnabled: boolean;
        name: string;
        stockAgingWarnDays?: number;
        stockAgingCriticalDays?: number;
      } | null;
    } | null = null;

    try {
      branch = await prisma.branch.findUnique({
        where: { id: session.branchId },
        select: {
          id: true,
          name: true,
          brandId: true,
          stockEnabled: true,
          brand: {
            select: {
              stockEnabled: true,
              name: true,
              stockAgingWarnDays: true,
              stockAgingCriticalDays: true,
            },
          },
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/stockAgingWarnDays|stockAgingCriticalDays|Unknown (arg|field)|column/i.test(msg)) {
        throw e;
      }
      branch = await prisma.branch.findUnique({
        where: { id: session.branchId },
        select: {
          id: true,
          name: true,
          brandId: true,
          stockEnabled: true,
          brand: { select: { stockEnabled: true, name: true } },
        },
      });
    }
    if (!branch?.brandId) return jsonError("สาขาไม่มีแบรนด์", 400);

    const brandWarn = sanitizeThreshold(
      branch.brand?.stockAgingWarnDays,
      DEFAULT_STOCK_AGING_WARN_DAYS,
    );
    const brandCritical = sanitizeThreshold(
      branch.brand?.stockAgingCriticalDays,
      DEFAULT_STOCK_AGING_CRITICAL_DAYS,
    );

    const warnDays = parseDays(url.searchParams.get("warnDays"), brandWarn);
    const criticalDays = Math.max(
      warnDays,
      parseDays(url.searchParams.get("criticalDays"), brandCritical),
    );

    const stockActive = isBranchStockActive({
      brandId: branch.brandId,
      brandStockEnabled: branch.brand?.stockEnabled,
      branchStockEnabled: branch.stockEnabled,
    });
    if (!stockActive) {
      return jsonOk({
        stockActive: false,
        warnDays,
        criticalDays,
        summary: {
          critical: 0,
          warn: 0,
          ok: 0,
          unknown: 0,
          criticalQty: 0,
          warnQty: 0,
          okQty: 0,
          unknownQty: 0,
          totalQty: 0,
          totalValueBaht: 0,
        },
        items: [] as StockAgingItem[],
      });
    }

    const todayKey = bangkokDateKey();

    // Include menu rows with qty even if brandProductId is not linked
    // (staff stock page already tracks these; summary/aging must match).
    const menuItems = await prisma.branchMenuItem.findMany({
      where: {
        branchId: branch.id,
        isHidden: false,
      },
      select: {
        id: true,
        name: true,
        price: true,
        promoEnabled: true,
        promoType: true,
        promoValue: true,
        promoContinuous: true,
        promoStartsAt: true,
        promoEndsAt: true,
        category: { select: { stockExempt: true } },
        stock: { select: { quantity: true } },
        optionGroupLinks: {
          select: { group: { select: { mode: true } } },
        },
      },
      orderBy: { name: "asc" },
    });

    const tracked = menuItems.filter((item) => {
      const isPromo = item.optionGroupLinks.some(
        (l) => l.group.mode === "FROM_MENU",
      );
      if (isPromo || item.category?.stockExempt) return false;
      return Math.max(0, Number(item.stock?.quantity ?? 0)) > 0;
    });

    const menuIds = tracked.map((m) => m.id);

    const historyByMenu = new Map<
      string,
      Array<{
        createdAt: Date;
        quantity: number;
        receivedAt?: Date | null;
        expiresAt?: Date | null;
      }>
    >();

    if (menuIds.length > 0) {
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
            receivedAt: true,
            expiresAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 5000,
        });
        for (const row of history) {
          const list = historyByMenu.get(row.menuItemId) ?? [];
          list.push({
            createdAt: row.createdAt,
            quantity: row.quantity,
            receivedAt: row.receivedAt,
            expiresAt: row.expiresAt,
          });
          historyByMenu.set(row.menuItemId, list);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/cancelledAt|receivedAt|expiresAt|Unknown arg|column/i.test(msg)) {
          console.error("[staff/stock/aging] history", msg);
        } else {
          const history = await prisma.branchMenuItemStockHistory.findMany({
            where: {
              branchId: branch.id,
              menuItemId: { in: menuIds },
              type: { in: [...INBOUND_TYPES] },
              quantity: { gt: 0 },
            },
            select: {
              menuItemId: true,
              createdAt: true,
              quantity: true,
            },
            orderBy: { createdAt: "desc" },
            take: 5000,
          });
          for (const row of history) {
            const list = historyByMenu.get(row.menuItemId) ?? [];
            list.push({ createdAt: row.createdAt, quantity: row.quantity });
            historyByMenu.set(row.menuItemId, list);
          }
        }
      }
    }

    const items: StockAgingItem[] = [];

    for (const item of tracked) {
      const quantity = Math.max(0, Number(item.stock?.quantity ?? 0));
      if (quantity <= 0) continue;
      const unitPrice = Number(item.price ?? 0);

      let ageDays: number | null = null;
      let oldestReceivedAt: string | null = null;
      let lastReceivedAt: string | null = null;
      let expiresAt: string | null = null;
      let daysToExpiry: number | null = null;
      const source: "history" = "history";
      let layers: StockAgingLayer[] = [];

      const allocated = allocateInboundLayers({
        currentQty: quantity,
        inbounds: historyByMenu.get(item.id) ?? [],
        todayKey,
      });
      layers = allocated.layers;
      ageDays = allocated.ageDays;
      oldestReceivedAt = allocated.oldestReceivedAt;
      lastReceivedAt = allocated.lastReceivedAt;
      expiresAt = allocated.expiresAt;
      daysToExpiry = allocated.daysToExpiry;
      if (allocated.unknownQty > 0 && allocated.layers.length === 0) {
        ageDays = null;
      }

      const level = classifyAgingLevel(
        ageDays,
        daysToExpiry,
        warnDays,
        criticalDays,
      );

      const priced = resolveSellPrice(item, "storefront");
      const promoActive = priced.discounted;
      const promoLabel = priced.label;
      const promoEndsAt =
        promoActive && item.promoEndsAt
          ? item.promoEndsAt.toISOString()
          : null;

      items.push({
        id: item.id,
        name: item.name,
        quantity,
        unitPrice: promoActive ? priced.final : unitPrice,
        valueBaht:
          Math.round(quantity * (promoActive ? priced.final : unitPrice) * 100) /
          100,
        ageDays,
        oldestReceivedAt,
        lastReceivedAt,
        expiresAt,
        daysToExpiry,
        level,
        source,
        layers,
        promoActive,
        promoLabel,
        promoEndsAt,
      });
    }

    items.sort((a, b) => {
      const lr = levelSortRank(a.level) - levelSortRank(b.level);
      if (lr !== 0) return lr;
      const ad = (b.ageDays ?? -1) - (a.ageDays ?? -1);
      if (ad !== 0) return ad;
      return a.name.localeCompare(b.name, "th");
    });

    const visible = includeOk
      ? items
      : items.filter((i) => i.level !== "ok");

    return jsonOk({
      stockActive: true,
      brandName: branch.brand?.name ?? "",
      branchName: branch.name,
      warnDays,
      criticalDays,
      asOf: todayKey,
      summary: summarizeAgingItems(items),
      attentionCount: items.filter(
        (i) => i.level === "critical" || i.level === "warn",
      ).length,
      items: visible,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
