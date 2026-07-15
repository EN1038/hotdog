import { requireStaff } from "@/lib/auth";
import { handleApiError, jsonOk } from "@/lib/api";

/** GET — ธีมแบรนด์ของสาขาที่พนักงานอยู่ (สี / โลโก้ สำหรับ /staff) */
export async function GET() {
  try {
    const session = await requireStaff();
    return jsonOk({
      branchName: session.branchName,
      brand: session.brand,
      autoAcceptOrders: session.autoAcceptOrders ?? false,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
