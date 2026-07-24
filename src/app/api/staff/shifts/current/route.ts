import { requireStaff } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  getActiveShift,
  serializeShift,
  ShiftGateError,
} from "@/lib/branch-shift";

function staffCanToggleStore(roles: string[]) {
  return roles.includes("SELLER") || roles.includes("BOTH");
}

/** GET — currently open shift for this staff branch. */
export async function GET() {
  try {
    const session = await requireStaff();
    const active = await getActiveShift(session.branchId);
    return jsonOk({
      activeShift: active ? serializeShift(active) : null,
      canSell: Boolean(active),
      canToggleStore: staffCanToggleStore(session.staffRoles),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
