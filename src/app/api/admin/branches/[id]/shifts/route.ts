import { requireBranchAccess } from "@/lib/admin-access";
import { handleApiError, jsonOk } from "@/lib/api";
import {
  getActiveShift,
  listShiftsForBranchDate,
  serializeShift,
} from "@/lib/branch-shift";
import { bangkokDateKey, isBangkokDateKey } from "@/lib/constants";

type Params = { params: Promise<{ id: string }> };

/** GET — list shifts for a branch on a Bangkok calendar / operating date. */
export async function GET(request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    await requireBranchAccess(branchId);

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");
    const dateKey =
      dateParam && isBangkokDateKey(dateParam)
        ? dateParam
        : bangkokDateKey();

    const [shifts, active] = await Promise.all([
      listShiftsForBranchDate(branchId, dateKey),
      getActiveShift(branchId),
    ]);

    return jsonOk({
      date: dateKey,
      shifts,
      activeShift: active ? serializeShift(active) : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
