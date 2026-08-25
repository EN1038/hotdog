import { z } from "zod";
import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";
import {
  ensureOrderPublicShareToken,
  orderPublicSharePath,
} from "@/lib/order-public-share";

type Params = { params: Promise<{ id: string }> };

/** POST — ensure public share token; returns public path + token. */
export async function POST(_request: Request, { params }: Params) {
  try {
    await ensureProdSchemaCompat();
    const { id } = await params;
    const order = await prisma.order.findUnique({
      where: { id },
      select: { id: true, branchId: true },
    });
    if (!order) return jsonError("ไม่พบออเดอร์", 404);
    await requireBranchAccess(order.branchId);

    const token = await ensureOrderPublicShareToken(id);
    return jsonOk({
      token,
      path: orderPublicSharePath(token),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const bodySchema = z.object({ regenerate: z.boolean().optional() });

/** PATCH optional regenerate token (revoke old link). */
export async function PATCH(request: Request, { params }: Params) {
  try {
    await ensureProdSchemaCompat();
    const { id } = await params;
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const order = await prisma.order.findUnique({
      where: { id },
      select: { id: true, branchId: true, publicShareToken: true },
    });
    if (!order) return jsonError("ไม่พบออเดอร์", 404);
    await requireBranchAccess(order.branchId);

    if (body.regenerate) {
      const { generateOrderPublicShareToken } = await import(
        "@/lib/order-public-share"
      );
      let token = generateOrderPublicShareToken();
      await prisma.order.update({
        where: { id },
        data: { publicShareToken: token },
      });
      return jsonOk({ token, path: orderPublicSharePath(token) });
    }

    const token = await ensureOrderPublicShareToken(id);
    return jsonOk({ token, path: orderPublicSharePath(token) });
  } catch (error) {
    return handleApiError(error);
  }
}
