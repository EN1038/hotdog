import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { lookupStockItemByCode } from "@/lib/stock-menu-lookup";

/** GET ?code= — resolve menu / stock item by product barcode or item code */
export async function GET(request: Request) {
  try {
    const session = await requireStaff();
    const code = new URL(request.url).searchParams.get("code")?.trim();
    if (!code) return jsonError("ต้องระบุรหัสสินค้า");

    const branch = await prisma.branch.findUnique({
      where: { id: session.branchId },
      select: { id: true, stockEnabled: true },
    });
    if (!branch) return jsonError("ไม่พบสาขา", 404);
    if (!branch.stockEnabled) {
      return jsonError("สาขานี้ยังไม่เปิดระบบสต๊อก");
    }

    const match = await lookupStockItemByCode({
      branchId: branch.id,
      code,
    });
    if (!match) {
      return jsonError("ไม่พบรหัสสินค้าในสาขานี้", 404);
    }

    return jsonOk(match);
  } catch (error) {
    return handleApiError(error);
  }
}
