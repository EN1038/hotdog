import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";
import { getOperatingRoundStatus } from "@/lib/operating-day";

/** GET — ธีมแบรนด์ + สถานะรอบทำงานของสาขาที่พนักงานอยู่ */
export async function GET() {
  try {
    const session = await requireStaff();
    const branch = await prisma.branch.findUnique({
      where: { id: session.branchId },
      select: {
        businessDayCutoffTime: true,
        lateEntryUntilTime: true,
      },
    });
    const round = getOperatingRoundStatus({
      businessDayCutoffTime: branch?.businessDayCutoffTime,
      lateEntryUntilTime: branch?.lateEntryUntilTime,
    });

    return jsonOk({
      branchId: session.branchId,
      branchName: session.branchName,
      staffDisplayName: session.staffDisplayName,
      staffPhone: session.staffPhone,
      brand: session.brand,
      autoAcceptOrders: session.autoAcceptOrders ?? false,
      operatingDay: round.operatingDay,
      entryLocked: round.entryLocked,
      canEnter: round.canEnter,
      businessDayCutoffTime: round.cutoffTime,
      lateEntryUntilTime: round.lateEntryUntilTime,
      entryDeadlineHm: round.entryDeadlineHm,
      minutesRemaining: round.minutesRemaining,
      tone: round.tone,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
