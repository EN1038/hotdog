import { requireStaff } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  closeActiveShift,
  serializeShift,
  ShiftGateError,
} from "@/lib/branch-shift";
import { z } from "zod";

function staffCanToggleStore(roles: string[]) {
  return roles.includes("SELLER") || roles.includes("BOTH");
}

const closeSchema = z.object({
  closingCash: z.number().finite().min(0).max(1_000_000),
});

/** POST — close the active sales round and return summary snapshot. */
export async function POST(request: Request) {
  try {
    const session = await requireStaff();
    if (!staffCanToggleStore(session.staffRoles)) {
      return jsonError("เฉพาะพนักงานขายเท่านั้นที่ปิดร้านได้", 403);
    }

    const body = closeSchema.parse(await request.json().catch(() => ({})));

    try {
      const { shift, summary } = await closeActiveShift({
        branchId: session.branchId,
        closedByStaffId: session.staffId,
        closingCash: body.closingCash,
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
