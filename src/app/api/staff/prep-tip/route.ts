import { requireStaff } from "@/lib/auth";
import { handleApiError, jsonOk } from "@/lib/api";
import { bangkokDateKey } from "@/lib/constants";
import { addDaysToDateKey } from "@/lib/operating-day";
import {
  bangkokWeekdayLabel,
  addBangkokDays,
} from "@/lib/inventory/inventory-date";
import {
  aggregateShopWeekdaySeries,
  loadShopDailySeries,
} from "@/lib/shop-overview-metrics";
import { buildStaffPrepTip } from "@/lib/sales-day-insights";
import { staffCanConvertStockSummary } from "@/lib/stock-count-convert-auth";

/** GET — คำแนะนำสั้น วันขายดี/ยอดอ่อน สำหรับพนักงาน */
export async function GET() {
  try {
    const session = await requireStaff();
    const today = bangkokDateKey();
    const from = addDaysToDateKey(today, -29);
    const days = await loadShopDailySeries([session.branchId], from, today);
    const weekdays = aggregateShopWeekdaySeries(days);
    const tip = buildStaffPrepTip(
      weekdays,
      today,
      bangkokWeekdayLabel,
      addBangkokDays(today, 1),
    );

    const canViewFull =
      Boolean(session.staffPhone) &&
      (await staffCanConvertStockSummary({
        branchId: session.branchId,
        staffPhone: session.staffPhone!,
      }));

    return jsonOk({
      tip,
      canViewFull,
      fullHref: canViewFull ? "/owner/sales-days" : null,
      range: { from, to: today },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
