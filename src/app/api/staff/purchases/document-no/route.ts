import { requireStaff } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/db";
import { isBangkokDateKey } from "@/lib/constants";
import {
  generatePurchaseDocumentNo,
  provisionalPurchaseDocumentNo,
} from "@/lib/purchase-document-no";

export async function GET(request: Request) {
  try {
    const session = await requireStaff();
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date")?.trim() || null;
    const documentDate =
      dateParam && isBangkokDateKey(dateParam) ? dateParam : undefined;

    const branch = await prisma.branch.findUnique({
      where: { id: session.branchId },
      select: { id: true, code: true },
    });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    try {
      const documentNo = await generatePurchaseDocumentNo({
        branchId: branch.id,
        branchCode: branch.code,
        documentDate,
      });
      return jsonOk({ documentNo, branchId: branch.id });
    } catch (error) {
      console.error("[purchases/document-no]", error);
      const documentNo = provisionalPurchaseDocumentNo(
        branch.code,
        branch.id,
        documentDate,
      );
      return jsonOk({ documentNo, branchId: branch.id, provisional: true });
    }
  } catch (error) {
    return handleApiError(error);
  }
}
