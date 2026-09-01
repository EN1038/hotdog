import { PAR_COMPARISON_LABELS } from "@/lib/inventory/inventory-par-labels";
import type { InventoryReasonCode } from "@/lib/inventory/inventory-reason-codes";

export type DerivedInventoryAlertKind =
  | "OUT_OF_STOCK"
  | "LOW_STOCK"
  | "BELOW_PAR"
  | "OVERSTOCK"
  | "REFILL_REQUIRED"
  | "HIGH_DEMAND"
  | "NO_PAR";

export type DerivedInventoryAlert = {
  kind: DerivedInventoryAlertKind;
  label: string;
  reasonCodes: InventoryReasonCode[];
};

const ALERT_LABELS: Record<DerivedInventoryAlertKind, string> = {
  OUT_OF_STOCK: "ของหมด",
  LOW_STOCK: "สต๊อกต่ำ",
  BELOW_PAR: PAR_COMPARISON_LABELS.BELOW_PAR,
  OVERSTOCK: "สต๊อกเกิน",
  REFILL_REQUIRED: "ควรเติมพรุ่งนี้",
  HIGH_DEMAND: "ความต้องการสูง",
  NO_PAR: PAR_COMPARISON_LABELS.NO_PAR,
};

/** Phase 1: derived alerts only — no persisted lifecycle. */
export function deriveInventoryAlerts(input: {
  availableStock: number;
  parStock: number;
  tomorrowTarget: number;
  suggestedRefill: number;
  recentTrendPct: number;
  reasonCodes?: InventoryReasonCode[];
}): DerivedInventoryAlert[] {
  const alerts: DerivedInventoryAlert[] = [];
  const baseReasons = input.reasonCodes ?? [];

  if (input.parStock <= 0) {
    alerts.push(alert("NO_PAR", baseReasons));
    return alerts;
  }

  if (input.availableStock <= 0) {
    alerts.push(alert("OUT_OF_STOCK", baseReasons));
  }

  if (input.suggestedRefill > 0) {
    alerts.push(alert("REFILL_REQUIRED", [...baseReasons, "BELOW_TARGET"]));
  }

  if (
    input.parStock > 0 &&
    input.availableStock > 0 &&
    input.availableStock < input.parStock * 0.5
  ) {
    alerts.push(alert("LOW_STOCK", baseReasons));
  }

  if (
    input.parStock > 0 &&
    input.availableStock < input.parStock &&
    input.suggestedRefill === 0
  ) {
    alerts.push(alert("BELOW_PAR", baseReasons));
  }

  if (input.parStock > 0 && input.availableStock > input.parStock * 1.25) {
    alerts.push(alert("OVERSTOCK", [...baseReasons, "ABOVE_TARGET"]));
  }

  if (input.recentTrendPct >= 20) {
    alerts.push(alert("HIGH_DEMAND", [...baseReasons, "HIGH_DEMAND"]));
  }

  return alerts;
}

function alert(
  kind: DerivedInventoryAlertKind,
  reasonCodes: InventoryReasonCode[],
): DerivedInventoryAlert {
  return {
    kind,
    label: ALERT_LABELS[kind],
    reasonCodes: [...new Set(reasonCodes)],
  };
}
