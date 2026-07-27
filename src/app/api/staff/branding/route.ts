import { OrderStatus } from "@prisma/client";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";
import { getCalendarDayState } from "@/lib/operating-day";
import { getActiveShift, serializeShift, shiftCalendarDateKey } from "@/lib/branch-shift";
import { isBranchStockActive } from "@/lib/stock";

/** GET — ธีมแบรนด์ + สถานะรอบทำงาน + badge สำหรับ shell */
export async function GET() {
  try {
    const session = await requireStaff();
    const [branch, activeShift, pendingOrderCount, pendingStockCount] =
      await Promise.all([
        prisma.branch.findUnique({
          where: { id: session.branchId },
          select: {
            isOpen: true,
            stockEnabled: true,
            brandId: true,
            brand: { select: { stockEnabled: true } },
          },
        }),
        getActiveShift(session.branchId),
        prisma.order.count({
          where: {
            branchId: session.branchId,
            status: OrderStatus.WAITING_FOR_STORE_ACCEPTANCE,
          },
        }),
        prisma.stockTransfer.count({
          where: {
            branchId: session.branchId,
            status: "PENDING",
          },
        }),
      ]);
    const day = getCalendarDayState();
    const canSell = Boolean(activeShift);
    const brandStockEnabled = Boolean(branch?.brand?.stockEnabled);
    const stockEnabled = Boolean(branch?.stockEnabled);

    return jsonOk({
      branchId: session.branchId,
      branchName: session.branchName,
      staffDisplayName: session.staffDisplayName,
      staffPhone: session.staffPhone,
      brand: session.brand,
      autoAcceptOrders: session.autoAcceptOrders ?? false,
      operatingDay: activeShift ? shiftCalendarDateKey(activeShift) : day.operatingDay,
      entryLocked: !canSell,
      canEnter: canSell,
      canSell,
      activeShift: activeShift ? serializeShift(activeShift) : null,
      isOpen: branch?.isOpen ?? false,
      tone: canSell ? "ok" : "locked",
      brandStockEnabled,
      stockEnabled,
      stockActive: isBranchStockActive({
        brandId: branch?.brandId,
        brandStockEnabled,
        branchStockEnabled: stockEnabled,
      }),
      pendingOrderCount,
      pendingStockCount,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
