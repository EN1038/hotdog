import {
  isPackLikeOptions,
  PACK_OPTIONS_ADDON_SEP,
} from "@/lib/order-item-display";

/** Lines with no filterable options — used as chip / API filter value. */
export const OPTION_FILTER_NONE = "__none__";

/**
 * Normalize tokens for ranking chips.
 * ปิ้ง is treated as ย่าง (same cook choice in many menus).
 */
export function normalizeOptionToken(name: string): string {
  const t = name.trim().replace(/\s+/g, " ");
  if (!t) return "";
  if (/^(ย่าง|ปิ้ง)$/u.test(t)) return "ย่าง";
  return t;
}

/**
 * Option names suitable for bestsellers filters.
 * Skips promo/pack stick lists (FROM_MENU); keeps MANUAL add-ons after " · ".
 */
export function extractFilterableOptionTokens(
  optionsText: string | null | undefined,
): string[] {
  const raw = (optionsText ?? "").trim();
  if (!raw) return [];

  let segment = raw;
  if (isPackLikeOptions(raw)) {
    const sepIdx = raw.indexOf(PACK_OPTIONS_ADDON_SEP);
    if (sepIdx < 0) return [];
    segment = raw.slice(sepIdx + PACK_OPTIONS_ADDON_SEP.length).trim();
    if (!segment) return [];
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of segment.split(/[,·]/u)) {
    const normalized = normalizeOptionToken(part);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

export function lineMatchesOptionFilter(
  optionsText: string | null | undefined,
  optionFilter: string | null | undefined,
): boolean {
  if (!optionFilter) return true;
  const tokens = extractFilterableOptionTokens(optionsText);
  if (optionFilter === OPTION_FILTER_NONE) return tokens.length === 0;
  return tokens.includes(optionFilter);
}

export type OptionQtySlice = {
  name: string;
  quantity: number;
  revenueBaht: number;
};

export function addOptionSlice(
  map: Map<string, { quantity: number; revenueBaht: number }>,
  name: string,
  quantity: number,
  revenueBaht: number,
): void {
  const cur = map.get(name) ?? { quantity: 0, revenueBaht: 0 };
  cur.quantity += quantity;
  cur.revenueBaht += revenueBaht;
  map.set(name, cur);
}

export function optionSummaryFromMap(
  map: Map<string, { quantity: number; revenueBaht: number }>,
  noneQty = 0,
  noneRevenue = 0,
): OptionQtySlice[] {
  const rows: OptionQtySlice[] = [...map.entries()].map(([name, v]) => ({
    name,
    quantity: v.quantity,
    revenueBaht: Math.round(v.revenueBaht * 100) / 100,
  }));
  if (noneQty > 0) {
    rows.push({
      name: OPTION_FILTER_NONE,
      quantity: noneQty,
      revenueBaht: Math.round(noneRevenue * 100) / 100,
    });
  }
  return rows.sort(
    (a, b) =>
      b.quantity - a.quantity || a.name.localeCompare(b.name, "th"),
  );
}

export function optionFilterLabel(name: string): string {
  if (name === OPTION_FILTER_NONE) return "ไม่มีตัวเลือก";
  return name;
}
