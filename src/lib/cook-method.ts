/**
 * Parse grill/fry cook method from OrderItem.optionsText.
 * Option names come from groups like "ย่าง / ทอด", "ปิ้ง / ทอด".
 */

export type CookMethod = "grill" | "fry" | "unknown";

export const COOK_METHOD_LABEL: Record<CookMethod, string> = {
  grill: "ย่าง",
  fry: "ทอด",
  unknown: "ไม่ระบุ",
};

const GRILL_TOKEN = /^(ย่าง|ปิ้ง)$/u;
const FRY_TOKEN = /^ทอด$/u;

/** Split optionsText into individual option name tokens. */
export function splitOptionTokens(
  optionsText: string | null | undefined,
): string[] {
  const raw = (optionsText ?? "").trim();
  if (!raw) return [];
  return raw
    .split(/[,·]/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Detect cook method from optionsText.
 * Prefer fry if both appear (unusual); otherwise first matching token.
 */
export function parseCookMethod(
  optionsText: string | null | undefined,
): CookMethod {
  const tokens = splitOptionTokens(optionsText);
  let foundGrill = false;
  let foundFry = false;
  for (const t of tokens) {
    if (FRY_TOKEN.test(t)) foundFry = true;
    else if (GRILL_TOKEN.test(t)) foundGrill = true;
  }
  if (foundFry && !foundGrill) return "fry";
  if (foundGrill && !foundFry) return "grill";
  if (foundFry && foundGrill) return "fry";
  return "unknown";
}

export type CookQtySlice = {
  quantity: number;
  revenueBaht: number;
};

export type CookBreakdown = Record<CookMethod, CookQtySlice>;

export function emptyCookBreakdown(): CookBreakdown {
  return {
    grill: { quantity: 0, revenueBaht: 0 },
    fry: { quantity: 0, revenueBaht: 0 },
    unknown: { quantity: 0, revenueBaht: 0 },
  };
}

export function addCookSlice(
  target: CookBreakdown,
  method: CookMethod,
  quantity: number,
  revenueBaht: number,
): void {
  const slice = target[method];
  slice.quantity += quantity;
  slice.revenueBaht += revenueBaht;
}

export function roundCookBreakdown(b: CookBreakdown): CookBreakdown {
  return {
    grill: {
      quantity: b.grill.quantity,
      revenueBaht: Math.round(b.grill.revenueBaht * 100) / 100,
    },
    fry: {
      quantity: b.fry.quantity,
      revenueBaht: Math.round(b.fry.revenueBaht * 100) / 100,
    },
    unknown: {
      quantity: b.unknown.quantity,
      revenueBaht: Math.round(b.unknown.revenueBaht * 100) / 100,
    },
  };
}
