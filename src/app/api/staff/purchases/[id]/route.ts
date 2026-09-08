import { requireStaff } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/db";
import { purchaseUpdateSchema } from "@/lib/branch-purchase";
import {
  deletePurchaseOrder,
  serializePurchaseOrder,
  updatePurchaseOrder,
} from "@/lib/branch-purchase-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const session = await requireStaff();
    const { id } = await params;
    const row = await prisma.branchPurchaseOrder.findFirst({
      where: { id, branchId: session.branchId },
      include: {
        lines: {
          orderBy: { sortOrder: "asc" },
          include: { item: { select: { imageUrl: true } } },
        },
      },
    });
    if (!row) return jsonError("ไม่พบรายการจัดซื้อ", 404);
    return jsonOk({ item: serializePurchaseOrder(row) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const session = await requireStaff();
    const { id } = await params;
    const body = purchaseUpdateSchema.parse(await request.json());
    try {
      const item = await updatePurchaseOrder({
        branchId: session.branchId,
        purchaseOrderId: id,
        staffId: session.staffId,
        data: body,
      });
      return jsonOk({ item });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "บันทึกไม่สำเร็จ";
      return jsonError(msg, 400);
    }
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const session = await requireStaff();
    const { id } = await params;
    try {
      const result = await deletePurchaseOrder({
        branchId: session.branchId,
        purchaseOrderId: id,
        staffId: session.staffId,
      });
      return jsonOk(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "ลบไม่สำเร็จ";
      return jsonError(msg, 400);
    }
  } catch (error) {
    return handleApiError(error);
  }
}
