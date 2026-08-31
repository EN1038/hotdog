import type { ParStockApiRow } from "@/lib/inventory/inventory-shared-types";
import { formatBangkokDateTime } from "@/lib/inventory/inventory-date";

export function formatParStockShareText(input: {
  branchName?: string;
  from: string;
  to: string;
  lastParUpdatedAt?: string | null;
  branchParTarget?: number | null;
  holdDays?: number;
  items: Array<{
    productCode: string;
    name: string;
    salesGradeLabel: string;
    totalSold: number;
    avgDailySales: number;
    minDailySales: number;
    maxDailySales: number;
    availableStock: number;
    currentPar: number;
    recommendedPar: number;
    refill: number;
  }>;
}): string {
  const header = input.branchName
    ? `📌 แนะนำ Par Stock — ${input.branchName}`
    : "📌 แนะนำ Par Stock";
  const target =
    input.branchParTarget != null
      ? `เป้าทั้งร้าน ${input.branchParTarget.toLocaleString("th-TH")} ไม้`
      : null;
  const hold =
    input.holdDays != null
      ? `ถือของประมาณ ${input.holdDays} วัน`
      : null;
  const sumPar = input.items.reduce((s, r) => s + r.currentPar, 0);
  const sumRec = input.items.reduce((s, r) => s + r.recommendedPar, 0);
  const sumRefill = input.items.reduce((s, r) => s + r.refill, 0);

  const lines = input.items.map((row, i) => {
    const refill =
      row.refill > 0 ? `ควรเติม ${row.refill}` : "พอแล้ว";
    return `${i + 1}. [${row.productCode}] [${row.salesGradeLabel}] ${row.name} — Par ${row.currentPar} · แนะนำ ${row.recommendedPar} · สต็อก ${row.availableStock} · ${refill} (ขาย ${row.totalSold} · เฉลี่ย ${row.avgDailySales} · ต่ำ-สูง ${row.minDailySales}–${row.maxDailySales})`;
  });

  return [
    header,
    `ช่วง ${input.from} – ${input.to}`,
    hold,
    input.lastParUpdatedAt
      ? `Par อัปเดตล่าสุด ${formatBangkokDateTime(input.lastParUpdatedAt)}`
      : "Par อัปเดตล่าสุด — ยังไม่เคยปรับ",
    target,
    "",
    ...lines,
    "",
    `รวม ${input.items.length} รายการ · Par ${sumPar.toLocaleString("th-TH")} · แนะนำ ${sumRec.toLocaleString("th-TH")} · ควรเติม ${sumRefill.toLocaleString("th-TH")}`,
  ]
    .filter((line) => line != null)
    .join("\n");
}

export function parStockShareRowsFromDisplayed(
  rows: ParStockApiRow[],
  draft: Record<string, string>,
): Array<{
  productCode: string;
  name: string;
  salesGradeLabel: string;
  totalSold: number;
  avgDailySales: number;
  minDailySales: number;
  maxDailySales: number;
  availableStock: number;
  currentPar: number;
  recommendedPar: number;
  refill: number;
}> {
  return rows.map((row) => {
    const raw = draft[row.menuItemId];
    const parsed = raw != null ? Number.parseInt(raw, 10) : NaN;
    const currentPar =
      Number.isInteger(parsed) && parsed >= 0 ? parsed : row.currentParStock;
    const onHand = row.stockTracked ? row.availableStock : 0;
    return {
      productCode: row.productCode,
      name: row.name,
      salesGradeLabel: row.salesGradeLabel,
      totalSold: row.totalSold ?? 0,
      avgDailySales: row.avgDailySales,
      minDailySales: row.minDailySales ?? 0,
      maxDailySales: row.maxDailySales ?? 0,
      availableStock: onHand,
      currentPar,
      recommendedPar: row.recommendedParStock,
      refill: Math.max(currentPar - onHand, 0),
    };
  });
}
