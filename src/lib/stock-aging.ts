import { bangkokDateKey, queueBusinessDateFromKey } from "@/lib/constants";

export type StockAgingLevel = "critical" | "warn" | "ok" | "unknown";

export type StockAgingLayer = {
  receivedAt: string;
  quantity: number;
  ageDays: number;
};

export type StockAgingItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  valueBaht: number;
  /** Days since oldest remaining inbound (null = unknown) */
  ageDays: number | null;
  oldestReceivedAt: string | null;
  lastReceivedAt: string | null;
  expiresAt: string | null;
  daysToExpiry: number | null;
  level: StockAgingLevel;
  source: "lot" | "history";
  layers: StockAgingLayer[];
  /** Active clear-out promo on the menu item */
  promoActive?: boolean;
  promoLabel?: string | null;
  promoEndsAt?: string | null;
};

export type StockAgingSummary = {
  critical: number;
  warn: number;
  ok: number;
  unknown: number;
  criticalQty: number;
  warnQty: number;
  okQty: number;
  unknownQty: number;
  totalQty: number;
  totalValueBaht: number;
};

/** Default: orange when age ≥ 3 days (3–4 = ส้ม) */
export const DEFAULT_STOCK_AGING_WARN_DAYS = 3;
/** Default: red when age ≥ 5 days (or near/expired) */
export const DEFAULT_STOCK_AGING_CRITICAL_DAYS = 5;

const INBOUND_TYPES = new Set(["STOCK_IN", "RESTOCK"]);

/** Whole calendar days between two Bangkok date keys (a → b). */
export function bangkokDayDiff(fromKey: string, toKey: string): number {
  const from = queueBusinessDateFromKey(fromKey).getTime();
  const to = queueBusinessDateFromKey(toKey).getTime();
  return Math.round((to - from) / 86_400_000);
}

export function ageDaysFromIso(
  isoOrDate: string | Date,
  todayKey = bangkokDateKey(),
): number {
  const key =
    typeof isoOrDate === "string"
      ? isoOrDate.slice(0, 10)
      : bangkokDateKey(isoOrDate);
  return Math.max(0, bangkokDayDiff(key, todayKey));
}

export function classifyAgingLevel(
  ageDays: number | null,
  daysToExpiry: number | null,
  warnDays: number,
  criticalDays: number,
): StockAgingLevel {
  if (daysToExpiry != null) {
    if (daysToExpiry <= 0) return "critical";
    if (daysToExpiry <= 1) return "critical";
    if (daysToExpiry <= warnDays) return "warn";
  }
  if (ageDays == null) return "unknown";
  if (ageDays >= criticalDays) return "critical";
  if (ageDays >= warnDays) return "warn";
  return "ok";
}

/**
 * Allocate current on-hand qty onto inbound history (newest first),
 * so remaining stock is attributed to the most recent receives (FIFO leftover = oldest first for age).
 */
export function allocateInboundLayers(params: {
  currentQty: number;
  inbounds: Array<{
    createdAt: Date;
    quantity: number;
    receivedAt?: Date | null;
    expiresAt?: Date | null;
  }>;
  todayKey?: string;
}): {
  layers: StockAgingLayer[];
  ageDays: number | null;
  oldestReceivedAt: string | null;
  lastReceivedAt: string | null;
  expiresAt: string | null;
  daysToExpiry: number | null;
  unknownQty: number;
} {
  const todayKey = params.todayKey ?? bangkokDateKey();
  let left = Math.max(0, Math.floor(params.currentQty));
  if (left <= 0) {
    return {
      layers: [],
      ageDays: null,
      oldestReceivedAt: null,
      lastReceivedAt: null,
      expiresAt: null,
      daysToExpiry: null,
      unknownQty: 0,
    };
  }

  const positive = params.inbounds
    .map((row) => ({
      receivedAt: row.receivedAt ?? row.createdAt,
      expiresAt: row.expiresAt ?? null,
      quantity: Math.abs(Math.floor(row.quantity)),
    }))
    .filter((row) => row.quantity > 0)
    .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());

  const layers: StockAgingLayer[] = [];
  let nearestExpiry: Date | null = null;
  for (const row of positive) {
    if (left <= 0) break;
    const take = Math.min(row.quantity, left);
    const receivedAt = row.receivedAt.toISOString();
    layers.push({
      receivedAt,
      quantity: take,
      ageDays: ageDaysFromIso(row.receivedAt, todayKey),
    });
    if (row.expiresAt) {
      if (!nearestExpiry || row.expiresAt < nearestExpiry) {
        nearestExpiry = row.expiresAt;
      }
    }
    left -= take;
  }

  const oldestFirst = [...layers].reverse();
  const oldest = oldestFirst[0] ?? null;
  const newest = layers[0] ?? null;
  const daysToExpiry =
    nearestExpiry != null
      ? bangkokDayDiff(todayKey, bangkokDateKey(nearestExpiry))
      : null;

  return {
    layers: oldestFirst,
    ageDays: oldest ? oldest.ageDays : null,
    oldestReceivedAt: oldest?.receivedAt ?? null,
    lastReceivedAt: newest?.receivedAt ?? null,
    expiresAt: nearestExpiry?.toISOString() ?? null,
    daysToExpiry,
    unknownQty: left,
  };
}

export function levelSortRank(level: StockAgingLevel): number {
  switch (level) {
    case "critical":
      return 0;
    case "warn":
      return 1;
    case "unknown":
      return 2;
    case "ok":
      return 3;
    default:
      return 9;
  }
}

export function summarizeAgingItems(
  items: StockAgingItem[],
): StockAgingSummary {
  const summary: StockAgingSummary = {
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
  };
  for (const item of items) {
    summary[item.level] += 1;
    const qtyKey = `${item.level}Qty` as
      | "criticalQty"
      | "warnQty"
      | "okQty"
      | "unknownQty";
    summary[qtyKey] += item.quantity;
    summary.totalQty += item.quantity;
    summary.totalValueBaht += item.valueBaht;
  }
  summary.totalValueBaht = Math.round(summary.totalValueBaht * 100) / 100;
  return summary;
}

export { INBOUND_TYPES };
