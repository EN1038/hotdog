import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  parseStockLabelQrPayload,
  stockLabelQrPayload,
} from "@/lib/stock-label";

/** GET ?barcode= — lookup package label by barcode / label code */
export async function GET(request: Request) {
  try {
    const session = await requireStaff();
    const barcode = new URL(request.url).searchParams.get("barcode")?.trim();
    if (!barcode) return jsonError("ต้องระบุ barcode");

    const qrParsed = parseStockLabelQrPayload(barcode);
    const labelCode = qrParsed?.labelCode ?? barcode;

    const label = await prisma.stockLabel.findFirst({
      where: {
        branchId: session.branchId,
        OR: [
          { labelCode },
          ...(qrParsed ? [{ id: qrParsed.id }] : []),
        ],
      },
    });
    if (!label) {
      return jsonError("ไม่พบป้ายหรือบาร์โค้ดนี้ในสาขา", 404);
    }

    return jsonOk({
      type: "package_label" as const,
      id: label.id,
      labelCode: label.labelCode,
      lotNumber: label.lotNumber,
      productName: label.productName,
      productCode: label.productCode,
      brandName: label.brandName,
      sourceBranchName: label.sourceBranchName,
      quantity: label.quantity,
      unit: label.unit,
      status: label.status,
      producedAt: label.producedAt?.toISOString() ?? null,
      expiresAt: label.expiresAt?.toISOString() ?? null,
      documentNo: label.documentNo,
      qrPayload: stockLabelQrPayload({
        id: label.id,
        labelCode: label.labelCode,
      }),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
