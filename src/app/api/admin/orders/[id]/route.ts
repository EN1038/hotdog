import { z } from "zod";
import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  paymentSlipUrl: z
    .union([z.string().max(2000), z.literal(""), z.null()])
    .optional(),
});

async function loadOrder(id: string) {
  return prisma.order.findUnique({
    where: { id },
    include: {
      branch: {
        select: { id: true, name: true, phone: true, brandId: true },
      },
      customer: true,
      deliveryLocation: true,
      items: {
        include: {
          branchMenuItem: { select: { imageUrl: true } },
        },
      },
      consumableLines: true,
    },
  });
}

export async function GET(_request: Request, { params }: Params) {
  try {
    await ensureProdSchemaCompat();
    const { id } = await params;
    const order = await loadOrder(id);
    if (!order) return jsonError("ไม่พบออเดอร์", 404);
    await requireBranchAccess(order.branchId);
    return jsonOk(order);
  } catch (error) {
    return handleApiError(error);
  }
}

/** PATCH — attach/remove payment slip image */
export async function PATCH(request: Request, { params }: Params) {
  try {
    await ensureProdSchemaCompat();
    const { id } = await params;
    const body = patchSchema.parse(await request.json());
    const existing = await prisma.order.findUnique({
      where: { id },
      select: { id: true, branchId: true },
    });
    if (!existing) return jsonError("ไม่พบออเดอร์", 404);
    await requireBranchAccess(existing.branchId);

    if (body.paymentSlipUrl === undefined) {
      return jsonError("ไม่มีข้อมูลให้อัปเดต");
    }

    const url =
      body.paymentSlipUrl == null || body.paymentSlipUrl === ""
        ? null
        : body.paymentSlipUrl.trim();

    if (url && !/^https?:\/\//i.test(url) && !url.startsWith("/uploads/")) {
      return jsonError("ลิงก์รูปสลิปไม่ถูกต้อง");
    }

    await prisma.order.update({
      where: { id },
      data: { paymentSlipUrl: url },
    });

    const order = await loadOrder(id);
    return jsonOk(order);
  } catch (error) {
    return handleApiError(error);
  }
}
