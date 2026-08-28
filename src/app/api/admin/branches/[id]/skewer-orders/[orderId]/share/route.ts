import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  ensureSkewerOrderPublicShareToken,
  skewerOrderPublicSharePath,
} from "@/lib/skewer-order-public-share";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";

type Params = { params: Promise<{ id: string; orderId: string }> };

/** POST — ensure public share token for skewer order; returns public path + token. */
export async function POST(_request: Request, { params }: Params) {
  try {
    await ensureProdSchemaCompat();
    const { id: branchId, orderId } = await params;
    await requireBranchAccess(branchId);

    const order = await prisma.skewerOrder.findFirst({
      where: { id: orderId, branchId },
      select: { id: true },
    });
    if (!order) return jsonError("ไม่พบออเดอร์", 404);

    const token = await ensureSkewerOrderPublicShareToken(orderId);
    return jsonOk({
      token,
      path: skewerOrderPublicSharePath(token),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
