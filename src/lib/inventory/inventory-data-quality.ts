import { INVENTORY_DEFAULTS } from "@/lib/inventory/inventory-config";

export type InventoryDataQuality = "GOOD" | "PARTIAL" | "INSUFFICIENT";

export const INVENTORY_DATA_QUALITY_LABELS: Record<
  InventoryDataQuality,
  string
> = {
  GOOD: "ข้อมูลเพียงพอ",
  PARTIAL: "ข้อมูลบางส่วน",
  INSUFFICIENT: "ข้อมูลยังไม่เพียงพอ",
};

export function deriveDataQuality(input: {
  tradingDaysWithSales: number;
  includesPartialStockTracking?: boolean;
}): InventoryDataQuality {
  if (input.tradingDaysWithSales < INVENTORY_DEFAULTS.minTradingDaysForPartial) {
    return "INSUFFICIENT";
  }
  if (
    input.includesPartialStockTracking ||
    input.tradingDaysWithSales < INVENTORY_DEFAULTS.minTradingDaysForGood
  ) {
    return "PARTIAL";
  }
  return "GOOD";
}
