import { requireStaff } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { buildShiftSummary, ShiftGateError } from "@/lib/branch-shift";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

/** GET — sales summary for one shift (same branch only). */
export async function GET(_request: Request, { params }: Params) {
  try {
    const session = await requireStaff();
    const { id } = await params;

    const shift = await prisma.branchShift.findFirst({
      where: { id, branchId: session.branchId },
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
