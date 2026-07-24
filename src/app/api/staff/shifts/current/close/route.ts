import { requireStaff } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  closeActiveShift,
  serializeShift,
  ShiftGateError,
} from "@/lib/branch-shift";

function staffCanToggleStore(roles: string[]) {
  return roles.includes("SELLER") || roles.includes("BOTH");
}

/** POST — close the active sales round and return summary snapshot. */
export async function POST() {
  try {
    const session = await requireStaff();
    if (!staffCanToggleStore(session.staffRoles)) {
      return jsonError("เฉพาะพนักงานขายเท่านั้นที่ปิดร้านได้", 403);
    }

    try {
      const { shift, summary } = await closeActiveShift({
        branchId: session.branchId,
        closedByStaffId: session.staffId,
      });
      return jsonOk({
        shift: serializeShift(shift),
        summary,
      });
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
