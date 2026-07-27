import { requireStaff } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { confirmStockTransfer, StockError } from "@/lib/stock";

type Params = { params: Promise<{ id: string }> };

/** POST — พนักงานยืนยันรับของจากบ้านกลางเข้าสต๊อกสาขา */
export async function POST(_request: Request, { params }: Params) {
  try {
    const session = await requireStaff();
    const { id } = await params;
    if (!session.staffId) {
      return jsonError("ไม่พบข้อมูลพนักงาน", 401);
    }

    const transfer = await confirmStockTransfer({
      transferId: id,
      branchId: session.branchId,
      staffId: session.staffId,
    });

    return jsonOk(transfer);
  } catch (error) {
    if (error instanceof StockError) {
      return jsonError(error.message, error.status);
    }
    return handleApiError(error);
  }
}
