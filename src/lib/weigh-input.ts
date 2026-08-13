/** Weight entry helpers — store always in kilograms. */

export type WeighInputUnit = "kg" | "g";

/** Accept "1.4", "1,4", "1400" depending on unit. */
export function parseWeightInput(
  raw: string,
  unit: WeighInputUnit,
): number | null {
  const cleaned = raw.trim().replace(/,/g, ".").replace(/\s+/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  const kg = unit === "g" ? n / 1000 : n;
  // Keep up to 3 decimal places in kg (matches Decimal(10,3))
  const rounded = Math.round(kg * 1000) / 1000;
  if (!(rounded > 0)) return null;
  return rounded;
}

export function formatWeightKgDisplay(kg: number): string {
  return kg.toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

export function weightInputPlaceholder(unit: WeighInputUnit): string {
  return unit === "g" ? "เช่น 350 หรือ 1400" : "เช่น 0.35 หรือ 1.4";
}

export function weightInputHint(unit: WeighInputUnit): string {
  return unit === "g"
    ? "กรอกเป็นกรัมจากตาชั่ง — ระบบแปลงเป็นกิโลให้อัตโนมัติ"
    : "กรอกเป็นกิโลกรัม ทศนิยมได้ เช่น 1.4";
}
