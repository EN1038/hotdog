import { requireStaff } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { confirmPurchaseOrder } from "@/lib/branch-purchase-service";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const session = await requireStaff();
    const { id } = await params;
    try {
      const item = await confirmPurchaseOrder({
        branchId: session.branchId,
        purchaseOrderId: id,
        staffId: session.staffId,
      });
      return jsonOk({ item });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "ยืนยันไม่สำเร็จ";
      return jsonError(msg, 400);
    }
  } catch (error) {
    return handleApiError(error);
  }
}
