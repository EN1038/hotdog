/**
 * Separator between promo sticks (FROM_MENU) and MANUAL add-ons in optionsText.
 * New orders: "ไม้1, ไม้2 · เผ็ดกลาง". Legacy: only commas.
 */
export const PACK_OPTIONS_ADDON_SEP = " · ";

/** Count selections stored in OrderItem.optionsText (`name, name, ...`). */
export function countOptionsInText(optionsText: string | null | undefined): number {
  if (!optionsText?.trim()) return 0;
  return optionsText
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean).length;
}

/**
 * Free pieces for a promo pack (FROM_MENU), e.g. maxSelect 11 → 10 paid + 1 gift.
 * giftPerPack = max(0, selectedFromMenuCount - (maxSelect - 1))
 */
export function giftQuantityForFromMenuPack(params: {
  lineQuantity: number;
  selectedFromMenuCount: number;
  maxSelect: number;
}): number {
  const qty = Math.max(0, Math.floor(params.lineQuantity));
  const selected = Math.max(0, Math.floor(params.selectedFromMenuCount));
  const maxSelect = Math.max(0, Math.floor(params.maxSelect));
  if (qty <= 0 || maxSelect < 2) return 0;
  const giftPerPack = Math.max(0, selected - (maxSelect - 1));
  return giftPerPack * qty;
}

/**
 * Promo packs (FROM_MENU / โปรเลือกไม้) store many picks in optionsText.
 * Regular add-ons are usually 1–2 names. Treat as pack-like when there are
 * many picks or repeated names (duplicate stick selections).
 */
export function isPackLikeOptions(optionsText: string | null | undefined): boolean {
  const stickSegment = packStickOptionsSegment(optionsText);
  const names = (stickSegment ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (names.length < 3) {
    const unique = new Set(names);
    return names.length >= 2 && unique.size < names.length;
  }
  return true;
}

/** Stick names segment (before add-on sep) for pack optionsText. */
export function packStickOptionsSegment(
  optionsText: string | null | undefined,
): string {
  const raw = (optionsText ?? "").trim();
  if (!raw) return "";
  const sepIdx = raw.indexOf(PACK_OPTIONS_ADDON_SEP);
  if (sepIdx >= 0) return raw.slice(0, sepIdx).trim();
  return raw;
}

/** Parse “โปร 10 ไม้แถม 1” → { paid: 10, free: 1, total: 11 }. */
export function parsePromoWoodGiftName(
  itemName?: string | null,
): { paid: number; free: number; total: number } | null {
  if (!itemName?.trim()) return null;
  const m = itemName.match(/(\d+)\s*ไม้\s*แถม\s*(\d+)/i);
  if (!m) return null;
  const paid = Number(m[1]);
  const free = Number(m[2]);
  if (!Number.isFinite(paid) || !Number.isFinite(free) || paid <= 0 || free < 0) {
    return null;
  }
  return { paid, free, total: paid + free };
}

/**
 * How many stick pieces are in a promo/pack line (not MANUAL เผ็ด/น้ำจิ้ม).
 */
export function countPackStickPieces(item: {
  quantity: number;
  itemName?: string | null;
  optionsText?: string | null;
  giftQuantity?: number | null;
}): number {
  const qty = Math.max(0, Math.floor(item.quantity));
  if (qty <= 0) return 0;
  const text = item.optionsText ?? "";
  if (!text.trim() || !isPackLikeOptions(text)) return 0;

  // Preferred: new format sticks · addons
  if (text.includes(PACK_OPTIONS_ADDON_SEP)) {
    return countOptionsInText(packStickOptionsSegment(text)) * qty;
  }

  const rawCount = countOptionsInText(text);
  const promo = parsePromoWoodGiftName(item.itemName);
  const gift = Math.max(0, Math.floor(Number(item.giftQuantity ?? 0)));

  // Legacy optionsText mixed MANUAL add-ons into the same comma list (e.g. 11 sticks + เผ็ด = 12).
  if (promo) {
    if (rawCount > promo.total) {
      // full pack size when count is only a few above (spicy/sauce/etc.)
      const extras = rawCount - promo.total;
      if (extras <= 4) {
        return promo.total * qty;
      }
      if (gift >= promo.free * qty || gift > 0) {
        return promo.total * qty;
      }
      return Math.min(rawCount, promo.total) * qty;
    }
    return rawCount * qty;
  }

  return rawCount * qty;
}

export type OrderItemForDisplay = {
  quantity: number;
  itemName?: string | null;
  optionsText?: string | null;
  giftQuantity?: number | null;
};

export type OrderItemsSummary = {
  /** e.g. "1 รายการ" or "3 ชิ้น" */
  primary: string;
  /** e.g. "11 ชิ้นในชุด" when pack options exist */
  secondary?: string;
  lineCount: number;
  pieceCount: number;
  hasPack: boolean;
};

export function summarizeOrderItems(
  items: OrderItemForDisplay[],
): OrderItemsSummary {
  let lineCount = 0;
  let pieceCount = 0;
  let hasPack = false;
  let packPieceCount = 0;

  for (const item of items) {
    const qty = Math.max(0, item.quantity);
    lineCount += qty;
    if (isPackLikeOptions(item.optionsText)) {
      const pieces = countPackStickPieces(item);
      if (pieces > 0) {
        hasPack = true;
        pieceCount += pieces;
        packPieceCount += pieces;
        continue;
      }
    }
    pieceCount += qty;
  }

  if (hasPack) {
    return {
      primary: `${lineCount.toLocaleString("th-TH")} รายการ`,
      secondary: `รวม ${packPieceCount.toLocaleString("th-TH")} ชิ้นในชุด`,
      lineCount,
      pieceCount,
      hasPack: true,
    };
  }

  return {
    primary: `${pieceCount.toLocaleString("th-TH")} ชิ้น`,
    lineCount,
    pieceCount,
    hasPack: false,
  };
}

/** Build optionsText: sticks first, then MANUAL add-ons after separator. */
export function formatOrderItemOptionsText(
  chosen: Array<{ name: string; mode?: string | null }>,
): string | null {
  if (chosen.length === 0) return null;
  const sticks = chosen
    .filter((c) => c.mode === "FROM_MENU")
    .map((c) => c.name.trim())
    .filter(Boolean);
  const manual = chosen
    .filter((c) => c.mode !== "FROM_MENU")
    .map((c) => c.name.trim())
    .filter(Boolean);
  if (sticks.length > 0 && manual.length > 0) {
    return `${sticks.join(", ")}${PACK_OPTIONS_ADDON_SEP}${manual.join(", ")}`;
  }
  if (sticks.length > 0) return sticks.join(", ");
  if (manual.length > 0) return manual.join(", ");
  return chosen
    .map((c) => c.name.trim())
    .filter(Boolean)
    .join(", ") || null;
}

function splitCommaNames(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Split optionsText for admin/staff detail UI.
 * Pack: sticks + extras (เผ็ด/น้ำจิ้ม). Regular: flat option names.
 */
export function parseOrderItemOptionsForDisplay(item: {
  itemName?: string | null;
  optionsText?: string | null;
  giftQuantity?: number | null;
  quantity?: number;
}): {
  isPack: boolean;
  stickNames: string[];
  stickCounts: Array<{ name: string; count: number }>;
  extraNames: string[];
  optionNames: string[];
  stickPieceTotal: number;
  giftQuantity: number;
} {
  const text = (item.optionsText ?? "").trim();
  const giftQuantity = Math.max(0, Math.floor(Number(item.giftQuantity ?? 0)));
  const isPack = Boolean(text) && isPackLikeOptions(text);
  if (!isPack) {
    const optionNames = splitCommaNames(text);
    return {
      isPack: false,
      stickNames: [],
      stickCounts: [],
      extraNames: [],
      optionNames,
      stickPieceTotal: 0,
      giftQuantity,
    };
  }

  let stickNames: string[] = [];
  let extraNames: string[] = [];

  if (text.includes(PACK_OPTIONS_ADDON_SEP)) {
    const [stickPart, ...rest] = text.split(PACK_OPTIONS_ADDON_SEP);
    stickNames = splitCommaNames(stickPart ?? "");
    extraNames = splitCommaNames(rest.join(PACK_OPTIONS_ADDON_SEP));
  } else {
    const all = splitCommaNames(text);
    const promo = parsePromoWoodGiftName(item.itemName);
    if (promo && all.length > promo.total) {
      stickNames = all.slice(0, promo.total);
      extraNames = all.slice(promo.total);
    } else {
      stickNames = all;
    }
  }

  const countMap = new Map<string, number>();
  for (const name of stickNames) {
    countMap.set(name, (countMap.get(name) ?? 0) + 1);
  }
  const stickCounts = [...countMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "th"));

  const qty = Math.max(1, Math.floor(Number(item.quantity ?? 1)));
  return {
    isPack: true,
    stickNames,
    stickCounts,
    extraNames,
    optionNames: [...extraNames],
    stickPieceTotal: countPackStickPieces({
      quantity: qty,
      itemName: item.itemName,
      optionsText: text,
      giftQuantity,
    }),
    giftQuantity,
  };
}
