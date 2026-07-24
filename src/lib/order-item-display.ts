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
  const names = (optionsText ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (names.length < 3) {
    const unique = new Set(names);
    return names.length >= 2 && unique.size < names.length;
  }
  return true;
}

export type OrderItemForDisplay = {
  quantity: number;
  itemName?: string | null;
  optionsText?: string | null;
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
    const optionCount = countOptionsInText(item.optionsText);
    if (isPackLikeOptions(item.optionsText) && optionCount > 0) {
      hasPack = true;
      const pieces = optionCount * Math.max(1, qty);
      pieceCount += pieces;
      packPieceCount += pieces;
    } else {
      pieceCount += qty;
    }
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
