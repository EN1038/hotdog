import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  getActiveShift,
  listShiftsForBranchDate,
  openShift,
  serializeShift,
  ShiftGateError,
} from "@/lib/branch-shift";
import { isBangkokDateKey, bangkokDateKey } from "@/lib/constants";

function staffCanToggleStore(roles: string[]) {
  return roles.includes("SELLER") || roles.includes("BOTH");
}

const openSchema = z.object({
  openingCash: z.number().finite().min(0).max(1_000_000),
  note: z.string().trim().max(500).optional().nullable(),
});

/** GET — list shifts for a Bangkok calendar date (default today). */
export async function GET(request: Request) {
  try {
    const session = await requireStaff();
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");
    const dateKey =
      dateParam && isBangkokDateKey(dateParam)
        ? dateParam
        : bangkokDateKey();

    const [shifts, active] = await Promise.all([
      listShiftsForBranchDate(session.branchId, dateKey),
      getActiveShift(session.branchId),
    ]);

    return jsonOk({
      date: dateKey,
      shifts,
      activeShift: active ? serializeShift(active) : null,
      canToggleStore: staffCanToggleStore(session.staffRoles),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST — open a new staff sales round (requires opening cash). */
export async function POST(request: Request) {
  try {
    const session = await requireStaff();
    if (!staffCanToggleStore(session.staffRoles)) {
      return jsonError("เฉพาะพนักงานขายเท่านั้นที่เปิดร้านได้", 403);
    }

    const body = openSchema.parse(await request.json());
    try {
      const shift = await openShift({
        branchId: session.branchId,
        openingCash: body.openingCash,
        note: body.note,
        openedByStaffId: session.staffId,
      });
      return jsonOk({ shift: serializeShift(shift) }, 201);
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
