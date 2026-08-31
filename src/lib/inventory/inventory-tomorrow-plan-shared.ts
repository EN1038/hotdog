import { bangkokWeekdayLabel } from "@/lib/inventory/inventory-date";

export type ParComparisonKind =
  | "NO_PAR"
  | "BELOW_PAR"
  | "AT_PAR"
  | "ABOVE_PAR";

export const PAR_COMPARISON_LABELS: Record<ParComparisonKind, string> = {
  NO_PAR: "ยังไม่ตั้ง Par",
  BELOW_PAR: "ต่ำกว่า Par",
  AT_PAR: "ใกล้ Par",
  ABOVE_PAR: "เกิน Par",
};

export const PAR_COMPARISON_TONE: Record<ParComparisonKind, string> = {
  NO_PAR: "bg-gray-100 text-gray-600 border-gray-200",
  BELOW_PAR: "bg-red-50 text-red-800 border-red-200",
  AT_PAR: "bg-emerald-50 text-emerald-800 border-emerald-200",
  ABOVE_PAR: "bg-sky-50 text-sky-800 border-sky-200",
};

export type TomorrowPlanShareRow = {
  productCode: string;
  name: string;
  category: string | null;
  salesGradeLabel: string;
  totalSold: number;
  sharePct: number;
  parStock: number;
  availableStock: number;
  belowParQty: number;
  parComparison: ParComparisonKind;
  tomorrowTarget: number;
  suggestedRefill: number;
  forecastQty: number;
  confirmedQty?: number;
};

export function deriveParComparison(
  availableStock: number,
  parStock: number,
): {
  kind: ParComparisonKind;
  label: string;
  belowParQty: number;
  gapFromPar: number;
} {
  if (parStock <= 0) {
    return {
      kind: "NO_PAR",
      label: PAR_COMPARISON_LABELS.NO_PAR,
      belowParQty: 0,
      gapFromPar: 0,
    };
  }

  const gapFromPar = availableStock - parStock;
  const belowParQty = Math.max(parStock - availableStock, 0);

  if (availableStock < parStock * 0.9) {
    return {
      kind: "BELOW_PAR",
      label: PAR_COMPARISON_LABELS.BELOW_PAR,
      belowParQty,
      gapFromPar,
    };
  }

  if (availableStock > parStock * 1.1) {
    return {
      kind: "ABOVE_PAR",
      label: PAR_COMPARISON_LABELS.ABOVE_PAR,
      belowParQty: 0,
      gapFromPar,
    };
  }

  return {
    kind: "AT_PAR",
    label: PAR_COMPARISON_LABELS.AT_PAR,
    belowParQty: 0,
    gapFromPar,
  };
}

export function exportTomorrowPlanCsv(
  branchName: string,
  input: {
    tomorrowDate: string;
    todayDate: string;
    items: TomorrowPlanShareRow[];
  },
): string {
  const header = [
    "สาขา",
    "วันที่แผน",
    "โหมด",
    "รหัสสินค้า",
    "เมนู",
    "หมวด",
    "กลุ่มขาย",
    "ขายช่วงวิเคราะห์",
    "สัดส่วน%",
    "Par Stock",
    "คงเหลือ",
    "ส่งผลิต (ถึง Par)",
    "ยืนยันส่งผลิต",
    "เทียบ Par",
    "คาดขายพรุ่งนี้",
  ];

  const lines = input.items.map((row) =>
    [
      branchName,
      input.tomorrowDate,
      "เติมถึง Par",
      row.productCode,
      row.name,
      row.category ?? "",
      row.salesGradeLabel,
      row.totalSold,
      row.sharePct,
      row.parStock,
      row.availableStock,
      row.suggestedRefill,
      row.confirmedQty ?? row.suggestedRefill,
      PAR_COMPARISON_LABELS[row.parComparison],
      row.forecastQty,
    ]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(","),
  );

  return `\uFEFF${[header.join(","), ...lines].join("\n")}`;
}

export function formatTomorrowPlanShareText(
  branchName: string,
  input: {
    tomorrowDate: string;
    items: TomorrowPlanShareRow[];
  },
): string {
  const weekday = bangkokWeekdayLabel(input.tomorrowDate);
  const totalQty = input.items.reduce(
    (s, r) => s + (r.confirmedQty ?? r.suggestedRefill),
    0,
  );
  const lines = input.items.map((row, i) => {
    const parPart =
      row.parStock > 0
        ? `Par ${row.parStock} · คงเหลือ ${row.availableStock}`
        : "ยังไม่ตั้ง Par";
    return `${i + 1}. [${row.productCode}] [${row.salesGradeLabel}] ${row.name} — ส่งผลิต ${row.confirmedQty ?? row.suggestedRefill} (${parPart}${row.forecastQty > 0 ? ` · คาดขาย ${row.forecastQty}` : ""})`;
  });

  return [
    `📦 แผนผลิต-เติมสินค้าขาย — ${branchName}`,
    `พรุ่งนี้ ${input.tomorrowDate} (${weekday})`,
    "โหมด: เติมถึง Par ที่ตั้งไว้",
    "",
    ...lines,
    "",
    `รวม ${totalQty.toLocaleString("th-TH")} ชิ้น · ${input.items.length} รายการ`,
  ].join("\n");
}

export function formatConfirmedPlanShareText(input: {
  branchName: string;
  planDate: string;
  statusLabel: string;
  note?: string | null;
  items: Array<{
    productCode: string;
    name: string;
    confirmedQty: number;
    suggestedQty: number;
    parStock: number;
    availableStock: number;
  }>;
}): string {
  const weekday = bangkokWeekdayLabel(input.planDate);
  const totalQty = input.items.reduce((s, r) => s + r.confirmedQty, 0);
  const lines = input.items.map((row, i) => {
    const parPart =
      row.parStock > 0
        ? `Par ${row.parStock} · คงเหลือ ${row.availableStock}`
        : "ยังไม่ตั้ง Par";
    return `${i + 1}. [${row.productCode}] ${row.name} — ส่งผลิต ${row.confirmedQty} (${parPart})`;
  });

  return [
    `📦 แผนผลิต-เติม — ${input.branchName}`,
    `วันที่ ${input.planDate} (${weekday}) · ${input.statusLabel}`,
    ...(input.note?.trim() ? [`หมายเหตุ: ${input.note.trim()}`] : []),
    "",
    ...lines,
    "",
    `รวม ${totalQty.toLocaleString("th-TH")} ชิ้น · ${input.items.length} รายการ`,
  ].join("\n");
}
