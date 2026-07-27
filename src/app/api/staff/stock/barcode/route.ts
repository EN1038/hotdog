import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

/** GET ?barcode= — lookup product by barcode for staff scan */
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
      ...product,
      branchQty: qty,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
