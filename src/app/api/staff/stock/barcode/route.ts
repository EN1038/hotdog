import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  parseStockLabelQrPayload,
  stockLabelQrPayload,
} from "@/lib/stock-label";

/** GET ?barcode= — lookup product or package label by barcode / label code */
export async function GET(request: Request) {
  try {
    const session = await requireStaff();
    const barcode = new URL(request.url).searchParams.get("barcode")?.trim();
    if (!barcode) return jsonError("ต้องระบุ barcode");

    const branch = await prisma.branch.findUnique({
      where: { id: session.branchId },
      select: { brandId: true },
    });
    if (!branch?.brandId) return jsonError("สาขาไม่มีแบรนด์", 400);

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
    if (label) {
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
    }

    const product = await prisma.brandProduct.findFirst({
      where: {
        brandId: branch.brandId,
        barcode,
        isActive: true,
      },
      include: {
        balances: {
          where: {
            location: { branchId: session.branchId },
          },
        },
        lots: {
          where: {
            quantity: { gt: 0 },
            location: { branchId: session.branchId },
          },
          orderBy: [{ expiresAt: "asc" }, { receivedAt: "asc" }],
          take: 10,
        },
      },
    });
    if (!product) return jsonError("ไม่พบสินค้าจากบาร์โค้ด", 404);

    const qty = product.balances.reduce((s, b) => s + b.quantity, 0);
    return jsonOk({
      type: "brand_product" as const,
      ...product,
      branchQty: qty,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
