import { PAR_COMPARISON_LABELS } from "@/lib/inventory/inventory-par-labels";
import type { InventoryDataQuality } from "@/lib/inventory/inventory-data-quality";

export type InventoryStatusKind =
  | "OUT_OF_STOCK"
  | "REFILL_REQUIRED"
  | "NORMAL"
  | "OVERSTOCK"
  | "NO_PAR"
  | "INSUFFICIENT_DATA";

export const INVENTORY_STATUS_LABELS: Record<InventoryStatusKind, string> = {
  OUT_OF_STOCK: "ของหมด",
  REFILL_REQUIRED: "ควรเติมพรุ่งนี้",
  NORMAL: "ปกติ",
  OVERSTOCK: "สต๊อกเกิน",
  NO_PAR: PAR_COMPARISON_LABELS.NO_PAR,
  INSUFFICIENT_DATA: "ข้อมูลไม่พอ",
};

export type InventoryStatusSeverity = "danger" | "warning" | "success" | "muted";

export type InventoryStatus = {
  kind: InventoryStatusKind;
  label: string;
  severity: InventoryStatusSeverity;
};

const SEVERITY: Record<InventoryStatusKind, InventoryStatusSeverity> = {
  OUT_OF_STOCK: "danger",
  REFILL_REQUIRED: "warning",
  NORMAL: "success",
  OVERSTOCK: "warning",
  NO_PAR: "muted",
  INSUFFICIENT_DATA: "muted",
};

export function deriveInventoryStatus(input: {
  availableStock: number;
  parStock: number;
  suggestedRefill: number;
  tomorrowTarget: number;
  dataQuality: InventoryDataQuality;
  overstockRatio?: number;
}): InventoryStatus {
  const ratio = input.overstockRatio ?? 1.25;

  if (input.dataQuality === "INSUFFICIENT" && input.parStock <= 0) {
    return status("INSUFFICIENT_DATA");
  }

  if (input.parStock <= 0) {
    return status("NO_PAR");
  }

  if (input.availableStock <= 0 && input.tomorrowTarget > 0) {
    return status("OUT_OF_STOCK");
  }

  if (input.suggestedRefill > 0) {
    return status("REFILL_REQUIRED");
  }

  if (
    input.parStock > 0 &&
    input.availableStock > input.parStock * ratio
  ) {
    return status("OVERSTOCK");
  }

  return status("NORMAL");
}

function status(kind: InventoryStatusKind): InventoryStatus {
  return {
    kind,
    label: INVENTORY_STATUS_LABELS[kind],
    severity: SEVERITY[kind],
  };
}

export const INVENTORY_STATUS_TONE: Record<InventoryStatusSeverity, string> = {
  danger: "bg-red-50 text-red-800 border-red-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  success: "bg-emerald-50 text-emerald-800 border-emerald-200",
  muted: "bg-gray-100 text-gray-600 border-gray-200",
};
