import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";
import {
  ensureOrderPublicShareToken,
  orderPublicSharePath,
} from "@/lib/order-public-share";

type Params = { params: Promise<{ id: string }> };

/** POST — staff ensure public receipt link for customer. */
export async function POST(_request: Request, { params }: Params) {
  try {
    await ensureProdSchemaCompat();
    const session = await requireStaff();
    const { id } = await params;
    const order = await prisma.order.findFirst({
      where: { id, branchId: session.branchId },
      select: { id: true },
    });
    if (!order) return jsonError("ไม่พบออเดอร์", 404);

    const token = await ensureOrderPublicShareToken(id);
    return jsonOk({
      token,
      path: orderPublicSharePath(token),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
