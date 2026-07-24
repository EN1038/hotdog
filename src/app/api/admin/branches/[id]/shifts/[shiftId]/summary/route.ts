import { requireBranchAccess } from "@/lib/admin-access";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { buildShiftSummary, ShiftGateError } from "@/lib/branch-shift";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ id: string; shiftId: string }> };

/** GET — sales summary for one shift under a branch. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id: branchId, shiftId } = await params;
    await requireBranchAccess(branchId);

    const shift = await prisma.branchShift.findFirst({
      where: { id: shiftId, branchId },
      select: { id: true },
    });
    if (!shift) return jsonError("ไม่พบรอบ", 404);

    try {
      const summary = await buildShiftSummary(shift.id);
      return jsonOk({ summary });
    } catch (e) {
      if (e instanceof ShiftGateError) {
        return jsonError(e.message, e.status);
      }
      throw e;
    }
  } catch (error) {
    return handleApiError(error);
  }
}
