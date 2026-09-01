/** คำเรียกแทน Par Stock สำหรับแม่ค้า (ไม่ใช้คำศัพท์ภาษาอังกฤษ) */
export const PAR_STOCK_LABEL = "ยอดที่ควรมี";
export const PAR_STOCK_SHORT_LABEL = "ควรมี";

export const PAR_COMPARISON_LABELS = {
  NO_PAR: "ยังไม่ตั้งยอด",
  BELOW_PAR: "ต่ำกว่าที่ควรมี",
  AT_PAR: "พอดี",
  ABOVE_PAR: "เกินที่ควรมี",
} as const;

/** แท็บ / หัวข้อฟีเจอร์ */
export function parStockFeatureTitle(branchName?: string | null) {
  return branchName
    ? `แนะนำ${PAR_STOCK_LABEL} — ${branchName}`
    : `แนะนำ${PAR_STOCK_LABEL}`;
}

export function parStockShareHeader(branchName?: string | null) {
  return branchName
    ? `📌 แนะนำ${PAR_STOCK_LABEL} — ${branchName}`
    : `📌 แนะนำ${PAR_STOCK_LABEL}`;
}

export function formatParAmountLine(par: number, availableStock: number) {
  return `${PAR_STOCK_SHORT_LABEL} ${par} · คงเหลือ ${availableStock}`;
}
