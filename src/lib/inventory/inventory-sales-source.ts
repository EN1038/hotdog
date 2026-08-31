/**
 * Phase 1 sales source policy
 *
 * Sales Demand ≠ Physical Stock Consumption in all channels.
 *
 * - Order COMPLETED: primary trusted source; deducts BranchMenuItemStock when configured.
 * - SkewerOrder (CONFIRMED/DELIVERED): included in demand analytics with PARTIAL marking
 *   because skewer channel does not always deduct physical stock.
 * - TableSession: excluded until explicit menuItem mapping and stock policy exist.
 *
 * Limitation: trading days are inferred from days with recorded sales, not branch open/close
 * calendar — closed days without sales are excluded automatically but days open with zero sales
 * may still count as trading days if other items sold.
 */
export type InventorySalesDataSource =
  | "ORDER_COMPLETED"
  | "ORDER_AND_SKEWER"
  | "INSUFFICIENT";

export const INVENTORY_SALES_SOURCE_NOTES: Record<
  InventorySalesDataSource,
  string
> = {
  ORDER_COMPLETED: "จากออเดอร์ที่เสร็จสิ้น (หักสต๊อกจริง)",
  ORDER_AND_SKEWER:
    "รวมออเดอร์ + เสียบไม้ (เสียบไม้อาจไม่หักสต๊อกจริง — ใช้วิเคราะห์ความต้องการเท่านั้น)",
  INSUFFICIENT: "ข้อมูลยังไม่เพียงพอ",
};

export function resolveSalesDataSource(input: {
  includesSkewer: boolean;
  hasOrderSales: boolean;
}): InventorySalesDataSource {
  if (!input.hasOrderSales && !input.includesSkewer) return "INSUFFICIENT";
  if (input.includesSkewer) return "ORDER_AND_SKEWER";
  return "ORDER_COMPLETED";
}
