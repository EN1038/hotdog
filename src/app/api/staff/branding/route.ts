import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";
import { getCalendarDayState } from "@/lib/operating-day";
import { getActiveShift, serializeShift } from "@/lib/branch-shift";

/** GET — ธีมแบรนด์ + สถานะรอบทำงานของสาขาที่พนักงานอยู่ */
export async function GET() {
  try {
    const session = await requireStaff();
    const [branch, activeShift] = await Promise.all([
      prisma.branch.findUnique({
        where: { id: session.branchId },
        select: {
          isOpen: true,
        },
      }),
      getActiveShift(session.branchId),
    ]);
    const day = getCalendarDayState();
    const canSell = Boolean(activeShift);

    return jsonOk({
      branchId: session.branchId,
      branchName: session.branchName,
      staffDisplayName: session.staffDisplayName,
      staffPhone: session.staffPhone,
      brand: session.brand,
      autoAcceptOrders: session.autoAcceptOrders ?? false,
      operatingDay: day.operatingDay,
      entryLocked: !canSell,
      canEnter: canSell,
      canSell,
      activeShift: activeShift ? serializeShift(activeShift) : null,
      isOpen: branch?.isOpen ?? false,
      tone: canSell ? "ok" : "locked",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
