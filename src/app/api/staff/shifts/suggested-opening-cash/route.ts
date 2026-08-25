import { requireStaff } from "@/lib/auth";
import { handleApiError, jsonOk } from "@/lib/api";
import { getSuggestedOpeningCash } from "@/lib/branch-shift";

/** GET — suggested opening float from last closed round */
export async function GET() {
  try {
    const session = await requireStaff();
    const suggested = await getSuggestedOpeningCash(session.branchId);
    return jsonOk(suggested);
  } catch (error) {
    return handleApiError(error);
  }
}
