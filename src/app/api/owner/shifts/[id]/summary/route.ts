import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { buildShiftSummary, ShiftGateError } from "@/lib/branch-shift";
import { prisma } from "@/lib/db";
import {
  ownerAccessErrorResponse,
  requireOwnerBranch,
  requireOwnerSession,
} from "@/lib/owner-accounts-access";

type Params = { params: Promise<{ id: string }> };

/** GET — sales summary for one shift on an owner-accessible branch. */
export async function GET(request: Request, { params }: Params) {
  try {
    const { session, brandIds } = await requireOwnerSession();
    const { searchParams } = new URL(request.url);
    const branch = await requireOwnerBranch(
      session,
      brandIds,
      searchParams.get("branchId"),
    );
    const { id } = await params;

    const shift = await prisma.branchShift.findFirst({
      where: { id, branchId: branch.id },
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
    const owned = ownerAccessErrorResponse(error);
    if (owned) return owned;
    return handleApiError(error);
  }
}
